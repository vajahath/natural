// Read-only views over WorldState. UIs should read through these, not raw state.
import { loansOutstanding } from "./rules/bank.js";
import { capOf, expectedIncome, jobsAt, workersOf } from "./rules/helpers.js";
import type { Family, Institution, LandRequest, Plot, TickStats, WorldState } from "./types.js";
import { totalMoney } from "./world.js";

export { totalMoney, loansOutstanding };

/** Should be ~0 every tick. Non-zero means money was created or destroyed outside the bank. */
export function moneyInvariantGap(state: WorldState): number {
  return totalMoney(state) - (state.seedMoney + loansOutstanding(state) + state.externalFlow);
}

export function latestStats(state: WorldState): TickStats | undefined {
  return state.history[state.history.length - 1];
}

export function landRequests(state: WorldState): LandRequest[] {
  return state.landRequests;
}

export function freePlots(state: WorldState): Plot[] {
  const busy = new Set(state.projects.map((p) => p.plotId));
  return state.plots.filter((p) => p.owner === null && !busy.has(p.id));
}

/** Plots where a given land request could be granted. */
export function eligiblePlotsFor(state: WorldState, request: LandRequest): Plot[] {
  const free = freePlots(state);
  if (request.requester.kind === "family") return free;
  const inst = state.institutions[request.requester.id];
  if (!inst) return [];
  const need = state.config.institutions[inst.type].resource;
  return need === "none" ? free : free.filter((p) => p.resource === need);
}

export interface InstitutionView {
  id: number;
  type: Institution["type"];
  level: number;
  cap: number;
  jobs: number;
  workers: number;
  wage: number;
  balance: number;
  lastOutput: number;
  plots: number[];
  hasRequest: boolean;
}

export function institutionViews(state: WorldState): InstitutionView[] {
  return Object.values(state.institutions).map((i) => ({
    id: i.id,
    type: i.type,
    level: i.level,
    cap: capOf(state, i.plotIds.length),
    jobs: jobsAt(state, i),
    workers: workersOf(state, i),
    wage: i.wage,
    balance: i.balance,
    lastOutput: i.lastOutput,
    plots: i.plotIds,
    hasRequest: i.requestId !== null,
  }));
}

export interface FamilyView {
  id: number;
  level: number;
  cap: number;
  renter: boolean;
  savings: number;
  income: number;
  happiness: number;
  employed: number;
  workers: number;
  debt: number;
}

export function familyViews(state: WorldState): FamilyView[] {
  return Object.values(state.families).map((f: Family) => ({
    id: f.id,
    level: f.level,
    cap: capOf(state, f.plotIds.length),
    renter: f.plotIds.length === 0,
    savings: f.savings,
    income: expectedIncome(state, f),
    happiness: f.happiness,
    employed: f.workers.filter((w) => w.jobId !== null).length,
    workers: f.workers.length,
    debt: f.loanIds.reduce((s, id) => s + (state.bank.loans[id]?.principal ?? 0), 0),
  }));
}

export interface Summary {
  tick: number;
  year: number;
  week: number;
  score: number;
  failed: string | null;
  stats: TickStats | undefined;
  treasury: number;
  landRequests: number;
  projects: number;
  moneyGap: number;
}

export function summary(state: WorldState): Summary {
  const stats = latestStats(state);
  return {
    tick: state.tick,
    year: Math.floor(state.tick / state.config.ticksPerYear) + 1,
    week: (state.tick % state.config.ticksPerYear) + 1,
    score: stats?.gdpPerPerson ?? 0,
    failed: state.failed,
    stats,
    treasury: state.treasury.balance,
    landRequests: state.landRequests.length,
    projects: state.projects.length,
    moneyGap: moneyInvariantGap(state),
  };
}
