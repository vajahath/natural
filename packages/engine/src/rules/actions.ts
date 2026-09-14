import type { Action, GameEvent, WorldState } from "../types.js";
import { newId, newInstitution } from "../world.js";
import { requestLoan } from "./bank.js";
import { tryConstruct } from "./construction.js";
import { accountOf, emit, expectedIncome, isFree } from "./helpers.js";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function applyAction(state: WorldState, action: Action, events: GameEvent[]): void {
  switch (action.type) {
    case "setIncomeTax":
      state.treasury.incomeTax = clamp01(action.rate);
      return;
    case "setSalesTax":
      state.treasury.salesTax = clamp01(action.rate);
      return;
    case "setLandPrice":
      state.treasury.landPrice = Math.max(0, action.price);
      return;
    case "setBaseRate":
      state.bank.baseRate = Math.max(0, Math.min(1, action.rate));
      return;
    case "setPublicWage":
      state.treasury.publicWage = Math.max(0, action.wage);
      return;
    case "buildRoad": {
      const plot = state.plots[action.plotId];
      if (!plot || plot.road) return;
      state.projects.push({ id: newId(state), kind: "road", plotId: action.plotId, woodNeeded: state.config.road.wood, woodDelivered: 0, laborCost: state.config.road.labor, laborPaid: 0 });
      return;
    }
    case "buildInstitution": {
      const plot = state.plots[action.plotId];
      const spec = state.config.institutions[action.institutionType];
      if (!plot || !isFree(state, action.plotId)) return emit(events, state, "rejected", `Plot ${action.plotId} is not free`);
      if (spec.resource !== "none" && plot.resource !== spec.resource) return emit(events, state, "rejected", `${action.institutionType} needs ${spec.resource}`);
      state.projects.push({ id: newId(state), kind: "institution", institutionType: action.institutionType, plotId: action.plotId, woodNeeded: spec.buildWood, woodDelivered: 0, laborCost: spec.buildLabor, laborPaid: 0 });
      return;
    }
    case "rejectLand": {
      const req = state.landRequests.find((r) => r.id === action.requestId);
      if (!req) return;
      state.landRequests = state.landRequests.filter((r) => r.id !== req.id);
      clearRequest(state, req.requester);
      return;
    }
    case "grantLand": {
      const req = state.landRequests.find((r) => r.id === action.requestId);
      const plot = state.plots[action.plotId];
      if (!req || !plot) return;
      if (!isFree(state, action.plotId)) return emit(events, state, "rejected", `Plot ${action.plotId} is not free`);
      const acct = accountOf(state, req.requester);
      if (!acct) {
        state.landRequests = state.landRequests.filter((r) => r.id !== req.id);
        return;
      }
      if (req.requester.kind === "institution") {
        const inst = state.institutions[req.requester.id]!;
        const spec = state.config.institutions[inst.type];
        if (spec.resource !== "none" && plot.resource !== spec.resource) return emit(events, state, "rejected", `${inst.type} needs ${spec.resource}`);
        if (inst.balance < req.money) return emit(events, state, "rejected", `${inst.type} #${inst.id} can no longer afford the land`);
        inst.balance -= req.money;
        state.treasury.balance += req.money;
        inst.plotIds.push(plot.id);
        plot.owner = req.requester;
        inst.requestId = null;
      } else {
        const fam = state.families[req.requester.id]!;
        const shortfall = Math.max(0, req.money - fam.savings);
        if (shortfall > 0 && !requestLoan(state, req.requester, shortfall, expectedIncome(state, fam))) {
          return emit(events, state, "rejected", `Bank refused family ${fam.id} a mortgage; request stays queued`, req.requester);
        }
        fam.savings -= req.money;
        state.treasury.balance += req.money;
        fam.plotIds.push(plot.id);
        plot.owner = req.requester;
        fam.requestId = null;
      }
      state.landRequests = state.landRequests.filter((r) => r.id !== req.id);
      emit(events, state, "landGranted", `Plot ${plot.id} granted for ${req.money.toFixed(0)}`, req.requester);
      return;
    }
  }
}

function clearRequest(state: WorldState, owner: { kind: "family" | "institution"; id: number }): void {
  if (owner.kind === "family") {
    const f = state.families[owner.id];
    if (f) f.requestId = null;
  } else {
    const i = state.institutions[owner.id];
    if (i) i.requestId = null;
  }
}

/**
 * Government projects consume wood as it becomes available and labour week by week: the
 * town's public workers build, so a small town builds slowly. Complete when both are done.
 */
export function advanceProjects(state: WorldState, events: GameEvent[]): void {
  const treasury = { get: () => Number.POSITIVE_INFINITY, add: (d: number) => (state.treasury.balance += d) };
  let crew = 0;
  for (const f of Object.values(state.families)) for (const w of f.workers) if (w.jobId === null) crew++;
  let laborBudget = Math.max(2, crew) * state.config.constructionRatePerWorker;
  const remaining = [];
  for (const p of state.projects) {
    const need = p.woodNeeded - p.woodDelivered;
    const step = Math.min(need, state.market.inventory.wood);
    if (step > 0 && tryConstruct(state, treasury, step, 0)) p.woodDelivered += step;
    const labor = Math.min(p.laborCost - p.laborPaid, laborBudget);
    if (labor > 0 && tryConstruct(state, treasury, 0, labor)) {
      p.laborPaid += labor;
      laborBudget -= labor;
    }
    if (p.woodDelivered + 1e-9 < p.woodNeeded || p.laborPaid + 1e-9 < p.laborCost) {
      remaining.push(p);
      continue;
    }
    const plot = state.plots[p.plotId]!;
    if (p.kind === "road") {
      plot.road = true;
      emit(events, state, "built", `Road built at (${plot.x},${plot.y})`);
    } else if (p.institutionType) {
      const inst = newInstitution(state, p.institutionType, p.plotId, 1, p.laborCost * 0.5);
      state.treasury.balance -= inst.balance; // working capital
      plot.road = true;
      state.institutions[inst.id] = inst;
      emit(events, state, "built", `${p.institutionType} #${inst.id} opened at (${plot.x},${plot.y})`, { kind: "institution", id: inst.id });
    }
  }
  state.projects = remaining;
}
