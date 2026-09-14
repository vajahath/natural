import { basketFor, levelCap } from "../config.js";
import type { Family, GameEvent, Institution, Owner, WorldState } from "../types.js";

/** Jobs the institution currently offers (capacity × utilization). */
export function jobsAt(state: WorldState, inst: Institution): number {
  return Math.max(1, Math.round(fullJobsAt(state, inst) * inst.utilization));
}

/** Jobs at full capacity for the institution's level. */
export function fullJobsAt(state: WorldState, inst: Institution): number {
  return state.config.institutions[inst.type].jobsPerLevel * inst.level;
}

export function workersOf(state: WorldState, inst: Institution): number {
  let n = 0;
  for (const f of Object.values(state.families)) for (const w of f.workers) if (w.jobId === inst.id) n++;
  return n;
}

export function familyMembers(f: Family): number {
  return 2 + f.workers.length;
}

/** Expected weekly after-tax income if every worker is paid. */
export function expectedIncome(state: WorldState, f: Family): number {
  let gross = 0;
  for (const w of f.workers) {
    if (w.jobId === null) continue;
    const inst = state.institutions[w.jobId];
    if (inst) gross += inst.wage;
  }
  return gross * (1 - state.treasury.incomeTax);
}

export function basketCost(state: WorldState, level: number): number {
  const b = basketFor(level);
  const p = state.market.prices;
  return (b.food * p.food + b.wood * p.wood + b.power * p.power) * (1 + state.treasury.salesTax);
}

export function weeklyDebtService(state: WorldState, loanIds: number[]): number {
  let s = 0;
  for (const id of loanIds) s += state.bank.loans[id]?.weeklyPayment ?? 0;
  return s;
}

export function capOf(state: WorldState, landUnits: number): number {
  return levelCap(state.config, landUnits);
}

export function emit(events: GameEvent[], state: WorldState, kind: string, message: string, subject?: Owner): void {
  events.push({ tick: state.tick, kind, message, subject });
}

export function accountOf(state: WorldState, owner: Owner): { get: () => number; add: (d: number) => void } | null {
  if (owner.kind === "family") {
    const f = state.families[owner.id];
    if (!f) return null;
    return { get: () => f.savings, add: (d) => (f.savings += d) };
  }
  const i = state.institutions[owner.id];
  if (!i) return null;
  return { get: () => i.balance, add: (d) => (i.balance += d) };
}

export function isFree(state: WorldState, plotId: number): boolean {
  const p = state.plots[plotId];
  return !!p && p.owner === null && !state.projects.some((pr) => pr.plotId === plotId);
}
