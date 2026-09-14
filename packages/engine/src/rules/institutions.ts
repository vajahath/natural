import { institutionUpgradeCost } from "../config.js";
import type { GameEvent, Institution, WorldState } from "../types.js";
import { newId } from "../world.js";
import { requestLoan } from "./bank.js";
import { splitCost, tryConstruct } from "./construction.js";
import { capOf, emit, jobsAt, workersOf } from "./helpers.js";

/** Pay wages (income tax withheld to treasury). Partial pay when short; workers quit if unpaid. */
export function payWages(state: WorldState): void {
  const tax = state.treasury.incomeTax;
  const quitAfter = state.config.wage.unpaidTicksToQuit;
  for (const inst of Object.values(state.institutions)) {
    let bill = 0;
    for (const f of Object.values(state.families)) for (const w of f.workers) if (w.jobId === inst.id) bill += inst.wage;
    inst.lastWageBill = bill;
    if (bill <= 0) {
      inst.missedWages = 0;
      continue;
    }
    // A state enterprise that cannot meet payroll and next week's inputs is bailed out by the treasury.
    const spec = state.config.institutions[inst.type];
    const inputs = spec.powerPerLevel * inst.level * state.market.prices.power * 1.5;
    if (inst.balance < bill + inputs) {
      const shortfall = bill + inputs - inst.balance;
      state.treasury.balance -= shortfall;
      state.treasury.subsidies += shortfall;
      inst.balance += shortfall;
      inst.missedWages++;
    } else inst.missedWages = 0;
    const ratio = 1;
    for (const f of Object.values(state.families)) {
      for (const w of f.workers) {
        if (w.jobId !== inst.id) continue;
        const gross = inst.wage * ratio;
        inst.balance -= gross;
        state.treasury.balance += gross * tax;
        f.savings += gross * (1 - tax);
        f.lastIncome += gross * (1 - tax);
        w.unpaidTicks = ratio < 0.999 ? w.unpaidTicks + 1 : 0;
        if (w.unpaidTicks >= quitAfter) w.jobId = null;
      }
    }
  }
}

function reserveFor(state: WorldState, inst: Institution): number {
  const cap = capOf(state, inst.plotIds.length);
  const next = inst.level < cap ? institutionUpgradeCost(state.config, inst.type, inst.level) : state.treasury.landPrice;
  return state.config.institution.reserveWeeks * jobsAt(state, inst) * inst.wage + next;
}

/** Wages, upgrades, land requests and surplus remittance. */
export function institutionDecisions(state: WorldState, events: GameEvent[]): void {
  const wcfg = state.config.wage;
  for (const inst of Object.values(state.institutions)) {
    const owner = { kind: "institution" as const, id: inst.id };
    const jobs = jobsAt(state, inst);
    const weeklyBill = jobs * inst.wage;

    // Wage setting: cut when losing money, raise when jobs stay unfilled.
    const losing = inst.type === "market" ? inst.balance < weeklyBill * wcfg.lowBalanceWeeks : inst.lastRevenue < inst.lastWageBill;
    const floor = Math.max(wcfg.min, state.treasury.publicWage * 1.05); // must beat the public job
    if (losing) inst.wage = Math.max(floor, inst.wage * (1 - wcfg.cutStep));
    else if (inst.unfilledTicks >= wcfg.unfilledTicksToRaise) {
      inst.wage *= 1 + wcfg.raiseStep;
      inst.unfilledTicks = 0;
    }

    const cap = capOf(state, inst.plotIds.length);
    const reserveWages = state.config.institution.reserveWeeks * weeklyBill;
    if (inst.level < cap) {
      const cost = institutionUpgradeCost(state.config, inst.type, inst.level);
      // Grow only when running at capacity and selling everything.
      let wants = workersOf(state, inst) >= jobs * 0.8 && inst.utilization >= 0.99;
      if (inst.type === "market") {
        const sold = state.market.lastSold.food + state.market.lastSold.wood + state.market.lastSold.power;
        wants = sold > 0.8 * state.config.marketCapacityPerLevel * inst.level;
      }
      if (wants && inst.balance >= reserveWages + cost * state.config.family.downPaymentRatio) {
        const { wood, labor } = splitCost(state, cost);
        if (state.market.inventory.wood < wood) {
          state.market.constructionWood = Math.max(state.market.constructionWood, wood);
          continue;
        }
        const shortfall = Math.max(0, cost + reserveWages - inst.balance);
        const income = Math.max(1, inst.lastRevenue - inst.lastWageBill);
        if (shortfall > 0 && !requestLoan(state, owner, shortfall, income)) continue;
        if (tryConstruct(state, { get: () => inst.balance, add: (d) => (inst.balance += d) }, wood, labor)) {
          inst.level++;
          emit(events, state, "upgrade", `${inst.type} #${inst.id} upgraded to level ${inst.level}`, owner);
        }
      }
    } else if (inst.requestId === null && inst.type !== "market" && inst.balance >= reserveWages + state.treasury.landPrice) {
      const id = newId(state);
      state.landRequests.push({ id, requester: owner, purpose: "expand", money: state.treasury.landPrice, tick: state.tick });
      inst.requestId = id;
      emit(events, state, "landRequest", `${inst.type} #${inst.id} is at its land cap and requests a plot`, owner);
    }

    // Remit surplus to the treasury (state-owned enterprise).
    const reserve = reserveFor(state, inst);
    if (inst.balance > reserve) {
      const remit = (inst.balance - reserve) * state.config.institution.remitRate;
      inst.balance -= remit;
      state.treasury.balance += remit;
    }
  }
}
