import { basketFor, homeUpgradeCost } from "../config.js";
import { nextRandom, randomInt, shuffle } from "../rng.js";
import type { Family, GameEvent, Good, WorldState } from "../types.js";
import { GOODS, INSTITUTION_TYPES } from "../types.js";
import { requestLoan } from "./bank.js";
import { splitCost, tryConstruct } from "./construction.js";
import { basketCost, capOf, emit, expectedIncome, familyMembers, jobsAt, weeklyDebtService, workersOf } from "./helpers.js";
import { newFamily, newId, newWorker } from "../world.js";

/** Unemployed workers apply for open jobs; each takes the best wage × skill offer left. */
export function matchJobs(state: WorldState): void {
  // Workers drift away from institutions paying less than the public job (a quarter per week).
  const publicWage = state.treasury.publicWage;
  for (const f of Object.values(state.families)) {
    for (const w of f.workers) {
      if (w.jobId === null) continue;
      const inst = state.institutions[w.jobId];
      if (!inst || (inst.wage < publicWage && nextRandom(state) < 0.25)) w.jobId = null;
    }
  }
  const open = new Map<number, number>();
  for (const inst of Object.values(state.institutions)) {
    let free = jobsAt(state, inst) - workersOf(state, inst);
    // Lay off the excess when capacity shrank.
    while (free < 0) {
      let done = false;
      for (const f of Object.values(state.families)) {
        for (const w of f.workers) {
          if (w.jobId === inst.id) {
            w.jobId = null;
            free++;
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) break;
    }
    if (free > 0) open.set(inst.id, free);
    else inst.unfilledTicks = 0;
  }
  const applicants: { fam: Family; idx: number }[] = [];
  for (const fam of Object.values(state.families)) {
    fam.workers.forEach((w, idx) => {
      if (w.jobId === null) applicants.push({ fam, idx });
    });
  }
  shuffle(state, applicants);
  for (const { fam, idx } of applicants) {
    const w = fam.workers[idx]!;
    let best: { id: number; score: number } | null = null;
    for (const [id, free] of open) {
      if (free <= 0) continue;
      const inst = state.institutions[id]!;
      if (inst.wage < publicWage) continue;
      const score = inst.wage * w.skills[inst.type];
      if (!best || score > best.score) best = { id, score };
    }
    if (best) {
      w.jobId = best.id;
      w.unpaidTicks = 0;
      open.set(best.id, (open.get(best.id) ?? 1) - 1);
    }
  }
  for (const [id, free] of open) {
    const inst = state.institutions[id]!;
    inst.unfilledTicks = free > 0 ? inst.unfilledTicks + 1 : 0;
  }
}

/** Skills grow on the job. */
export function train(state: WorldState): void {
  const gain = state.config.family.skillGainPerTick;
  for (const fam of Object.values(state.families)) {
    for (const w of fam.workers) {
      if (w.jobId === null) continue;
      const inst = state.institutions[w.jobId];
      if (!inst) {
        w.jobId = null;
        continue;
      }
      w.skills[inst.type] = Math.min(1, w.skills[inst.type] + gain);
    }
  }
}

/** Families pay rent and buy their basket from the market. Records demand for price setting. */
export function consume(state: WorldState, events: GameEvent[]): void {
  const cfg = state.config.family;
  const market = state.institutions[state.market.institutionId]!;
  const salesTax = state.treasury.salesTax;
  const order: Good[] = ["food", "power", "wood"];
  for (const fam of Object.values(state.families)) {
    if (fam.plotIds.length === 0) {
      const rent = Math.min(cfg.rent, Math.max(0, fam.savings));
      fam.savings -= rent;
      state.treasury.balance += rent;
    }
    const basket = basketFor(fam.level);
    let wanted = 0;
    let got = 0;
    for (const g of order) {
      const want = basket[g];
      if (want <= 0) continue;
      const unit = state.market.prices[g] * (1 + salesTax);
      const affordable = unit > 0 ? fam.savings / unit : want;
      state.market.demand[g] += Math.min(want, affordable); // effective demand: wants backed by money
      state.market.wanted[g] += want;
      const qty = Math.max(0, Math.min(want, state.market.inventory[g], affordable));
      const cost = qty * unit;
      fam.savings -= cost;
      market.balance += qty * state.market.prices[g];
      state.treasury.balance += cost - qty * state.market.prices[g];
      state.market.inventory[g] -= qty;
      state.market.lastSold[g] += qty;
      const weight = g === "food" ? 2 : 1;
      wanted += weight;
      got += weight * (qty / want);
    }
    fam.lastSatisfaction = wanted > 0 ? got / wanted : 1;
    if (fam.lastSatisfaction < cfg.satisfiedThreshold) fam.missedBasket++;
    else fam.missedBasket = 0;
    const publicWeight = state.treasury.publicWage > 0 ? 0.6 : 0;
    const employed = fam.workers.reduce((s, w) => s + (w.jobId !== null ? 1 : publicWeight), 0) / fam.workers.length;
    const target = 0.6 * fam.lastSatisfaction + 0.4 * employed;
    fam.happiness = fam.happiness * (1 - cfg.happinessSmoothing) + target * cfg.happinessSmoothing;
    const cushioned = fam.savings >= cfg.emigrateSavingsWeeks * basketCost(state, fam.level);
    fam.unhappyTicks = fam.happiness < cfg.emigrateHappiness && !cushioned ? fam.unhappyTicks + 1 : 0;

    if (fam.missedBasket >= cfg.missedBasketDowngrade && fam.level > 1) {
      fam.level--;
      fam.missedBasket = 0;
      emit(events, state, "downgrade", `Family ${fam.id} fell to level ${fam.level}`, { kind: "family", id: fam.id });
    }
  }
}

/** Upgrade home, buy land, or request more land. */
export function familyDecisions(state: WorldState, events: GameEvent[]): void {
  const cfg = state.config.family;
  for (const fam of Object.values(state.families)) {
    const owner = { kind: "family" as const, id: fam.id };
    const income = expectedIncome(state, fam);
    const debt = weeklyDebtService(state, fam.loanIds);
    if (fam.requestId !== null) continue;

    if (fam.plotIds.length === 0) {
      // Renter: buy a plot once the down payment is saved and the EMI is affordable.
      const price = state.treasury.landPrice;
      const byIncome = fam.savings >= price * cfg.downPaymentRatio && income > basketCost(state, 1) + debt;
      const byWealth = fam.savings - price >= cfg.upgradeWealthWeeks * basketCost(state, 1);
      if (byIncome || byWealth) {
        fileRequest(state, fam, "home", price, events);
      }
      continue;
    }

    const cap = capOf(state, fam.plotIds.length);
    const canAfford = (nextLevel: number, cost: number) => {
      const nextCost = basketCost(state, nextLevel);
      const byIncome = fam.savings >= cost * cfg.downPaymentRatio && income >= cfg.upgradeIncomeRatio * nextCost + debt;
      const byWealth = fam.savings - cost >= cfg.upgradeWealthWeeks * (nextCost + debt);
      return byIncome || byWealth;
    };
    if (fam.level < cap) {
      const cost = homeUpgradeCost(state.config, fam.level);
      if (canAfford(fam.level + 1, cost)) {
        const { wood, labor } = splitCost(state, cost);
        if (state.market.inventory.wood < wood) {
          state.market.constructionWood = Math.max(state.market.constructionWood, wood);
          continue;
        }
        const shortfall = Math.max(0, cost - fam.savings);
        if (shortfall > 0 && !requestLoan(state, owner, shortfall, income)) continue;
        const ok = tryConstruct(state, { get: () => fam.savings, add: (d) => (fam.savings += d) }, wood, labor);
        if (ok) {
          fam.level++;
          emit(events, state, "homeUpgrade", `Family ${fam.id} upgraded home to level ${fam.level}`, owner);
        }
      }
    } else if (canAfford(fam.level + 1, state.treasury.landPrice)) {
      fileRequest(state, fam, "expand", state.treasury.landPrice, events);
    }
  }
}

function fileRequest(state: WorldState, fam: Family, purpose: "home" | "expand", money: number, events: GameEvent[]): void {
  const id = newId(state);
  state.landRequests.push({ id, requester: { kind: "family", id: fam.id }, purpose, money, tick: state.tick });
  fam.requestId = id;
  emit(events, state, "landRequest", `Family ${fam.id} requests land (${purpose}) offering ${money.toFixed(0)}`, { kind: "family", id: fam.id });
}

/** Unhappy families leave with their savings; happy societies attract newcomers. */
export function migrate(state: WorldState, events: GameEvent[]): void {
  const cfg = state.config.family;
  const fams = Object.values(state.families);
  for (const fam of fams) {
    if (fam.unhappyTicks < cfg.emigrateTicks) continue;
    state.externalFlow -= fam.savings;
    for (const pid of fam.plotIds) {
      const p = state.plots[pid];
      if (p) p.owner = null;
    }
    for (const id of fam.loanIds) {
      const loan = state.bank.loans[id];
      if (loan) {
        state.bank.balance -= loan.principal;
        state.bank.writeOffs += loan.principal;
        delete state.bank.loans[id];
      }
    }
    if (fam.requestId !== null) state.landRequests = state.landRequests.filter((r) => r.id !== fam.requestId);
    delete state.families[fam.id];
    emit(events, state, "emigration", `Family ${fam.id} left the city`, { kind: "family", id: fam.id });
  }
  const remaining = Object.values(state.families);
  if (remaining.length === 0) return;
  let happiness = 0;
  let workers = 0;
  let unemployed = 0;
  for (const f of remaining) {
    happiness += f.happiness;
    workers += f.workers.length;
    unemployed += f.workers.filter((w) => w.jobId === null).length;
  }
  happiness /= remaining.length;
  const unemployment = workers > 0 ? unemployed / workers : 0;
  const expected = cfg.immigrationRate * Math.max(0, happiness - 0.4) * 2 * Math.max(0, 1 - unemployment * 10);
  if (nextRandom(state) < expected) {
    const sector = INSTITUTION_TYPES[randomInt(state, INSTITUTION_TYPES.length)] ?? "farm";
    const workersList = [newWorker(state.config, sector, 0.7)];
    if (nextRandom(state) < 0.5) workersList.push(newWorker(state.config, sector, 0.7));
    const fam = newFamily(state, workersList, 0);
    state.families[fam.id] = fam;
    emit(events, state, "immigration", `A new family (${fam.id}) arrived`, { kind: "family", id: fam.id });
  }
}

export function population(state: WorldState): number {
  let n = 0;
  for (const f of Object.values(state.families)) n += familyMembers(f);
  return n;
}

export { GOODS };
