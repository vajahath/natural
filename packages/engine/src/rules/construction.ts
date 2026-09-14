import type { WorldState } from "../types.js";

/**
 * Pay for construction: wood bought from the market at the current price, labour paid to
 * families (public workers first, since they are the state's labour pool). Returns false and
 * pays nothing when the market lacks wood or the payer lacks money.
 */
export function tryConstruct(
  state: WorldState,
  payer: { get: () => number; add: (d: number) => void },
  woodUnits: number,
  laborCost: number,
): boolean {
  const woodCost = woodUnits * state.market.prices.wood;
  if (state.market.inventory.wood < woodUnits) {
    state.market.constructionWood = Math.max(state.market.constructionWood, woodUnits);
    return false;
  }
  if (payer.get() < woodCost + laborCost) return false;
  const market = state.institutions[state.market.institutionId]!;
  state.market.inventory.wood -= woodUnits;
  state.market.lastSold.wood += woodUnits;
  payer.add(-woodCost - laborCost);
  market.balance += woodCost;
  payLabor(state, laborCost);
  return true;
}

export function payLabor(state: WorldState, amount: number): void {
  if (amount <= 0) return;
  const families = Object.values(state.families);
  if (families.length === 0) {
    state.treasury.balance += amount; // nobody to pay: money stays with the state
    return;
  }
  const unemployed = families.filter((f) => f.workers.some((w) => w.jobId === null));
  let remaining = amount;
  if (unemployed.length > 0) {
    const share = Math.min(state.config.laborCapPerFamily, amount / unemployed.length);
    for (const f of unemployed) {
      f.savings += share;
      f.lastIncome += share;
      remaining -= share;
    }
  }
  if (remaining > 1e-9) {
    const share = remaining / families.length;
    for (const f of families) {
      f.savings += share;
      f.lastIncome += share;
    }
  }
}

/** Split a money cost into wood units (at base price) and labour money. */
export function splitCost(state: WorldState, cost: number): { wood: number; labor: number } {
  const woodMoney = cost * state.config.constructionWoodShare;
  return { wood: woodMoney / state.config.basePrices.wood, labor: cost - woodMoney };
}

/** Every worker without an institution job works for the state at the public wage. */
export function publicPayroll(state: WorldState): void {
  const wage = state.treasury.publicWage;
  if (wage <= 0) return;
  const tax = state.treasury.incomeTax;
  for (const f of Object.values(state.families)) {
    for (const w of f.workers) {
      if (w.jobId !== null) continue;
      state.treasury.balance -= wage;
      state.treasury.balance += wage * tax;
      f.savings += wage * (1 - tax);
      f.lastIncome += wage * (1 - tax);
    }
  }
}
