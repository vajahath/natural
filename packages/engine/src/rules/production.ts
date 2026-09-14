import type { GameEvent, Good, Institution, WorldState } from "../types.js";
import { GOODS } from "../types.js";
import { fullJobsAt } from "./helpers.js";

/** Buy up to `units` of a good from the market for an institution. Returns units obtained. */
function buyFromMarket(state: WorldState, inst: Institution, good: Good, units: number): number {
  const price = state.market.prices[good];
  const affordable = price > 0 ? inst.balance / price : units;
  const got = Math.max(0, Math.min(units, state.market.inventory[good], affordable));
  if (got <= 0) return 0;
  const market = state.institutions[state.market.institutionId]!;
  state.market.inventory[good] -= got;
  state.market.lastSold[good] += got;
  inst.balance -= got * price;
  market.balance += got * price;
  return got;
}

function crewProductivity(state: WorldState, inst: Institution): number {
  const jobs = fullJobsAt(state, inst);
  if (jobs === 0) return 0;
  let skill = 0;
  for (const f of Object.values(state.families)) {
    for (const w of f.workers) if (w.jobId === inst.id) skill += w.skills[inst.type];
  }
  return Math.min(1, skill / jobs);
}

/** Mean skill of the current crew (1 when nobody is hired yet), used to size capacity. */
function averageSkill(state: WorldState, inst: Institution): number {
  let skill = 0;
  let n = 0;
  for (const f of Object.values(state.families)) {
    for (const w of f.workers) if (w.jobId === inst.id) {
      skill += w.skills[inst.type];
      n++;
    }
  }
  return n > 0 ? skill / n : 1;
}

/**
 * Producers plan output from demand: each good's producers move their utilization toward the
 * share of total capacity that last week's demand (plus any stock shortfall) would absorb.
 * This is what keeps supply from overshooting and prices from swinging wildly.
 */
export function planProduction(state: WorldState): void {
  const cfg = state.config;
  const capacity: Record<Good, number> = { food: 0, wood: 0, power: 0 };
  const producers = Object.values(state.institutions).filter((i) => cfg.institutions[i.type].produces !== null);
  for (const inst of producers) {
    const spec = cfg.institutions[inst.type];
    capacity[spec.produces as Good] += spec.baseOutput * inst.level * averageSkill(state, inst);
  }
  for (const g of GOODS) {
    if (capacity[g] <= 0) continue;
    let desired = state.market.lastDemand[g];
    if (cfg.spoilage[g] === 0) {
      const target = state.market.lastDemand[g] * cfg.market.stockWeeks + 30;
      desired += Math.max(0, target - state.market.inventory[g]) * 0.25;
    }
    const minUtil = cfg.minUtilization;
    const targetUtil = Math.max(minUtil, Math.min(1, desired / capacity[g]));
    for (const inst of producers) {
      if (cfg.institutions[inst.type].produces !== g) continue;
      const delta = Math.max(-0.05, Math.min(0.1, targetUtil - inst.utilization));
      inst.utilization = Math.max(minUtil, Math.min(1, inst.utilization + delta));
    }
  }
}

/**
 * Producers buy power, produce, and sell to the market. Power producers go first so this
 * week's electricity is available to everyone else. Output is valued at market prices for GDP.
 */
export function produceAndSell(state: WorldState, events: GameEvent[]): number {
  let gdp = 0;
  const cfg = state.config;
  const market = state.institutions[state.market.institutionId]!;
  for (const g of GOODS) state.market.lastSupply[g] = state.market.inventory[g];
  const producers = Object.values(state.institutions)
    .filter((i) => cfg.institutions[i.type].produces !== null)
    .sort((a, b) => (a.type === "coalPlant" ? -1 : 0) - (b.type === "coalPlant" ? -1 : 0) || a.id - b.id);

  for (const inst of producers) {
    const spec = cfg.institutions[inst.type];
    const good = spec.produces as Good;
    let factor = crewProductivity(state, inst);
    const powerNeed = spec.powerPerLevel * inst.level;
    if (powerNeed > 0) {
      const got = buyFromMarket(state, inst, "power", powerNeed);
      state.market.demand.power += powerNeed;
      factor *= 0.3 + 0.7 * (got / powerNeed);
    }
    // Each plot without a road contributes at reduced output.
    const roadFactor = inst.plotIds.reduce((sum, pid) => sum + (state.plots[pid]?.road ? 1 : cfg.roadlessOutputFactor), 0) / Math.max(1, inst.plotIds.length);
    factor *= roadFactor;
    const output = spec.baseOutput * inst.level * factor;
    inst.lastOutput = output;
    gdp += output * state.market.prices[good];
    state.market.lastSupply[good] += output;
    state.market.lastOffered[good] += output;

    // Market buys wholesale; perishables only up to expected demand; limited by its cash.
    const wholesale = state.market.prices[good] * (1 - cfg.market.margin);
    let cap = output;
    if (cfg.spoilage[good] > 0) {
      cap = Math.min(cap, Math.max(0, state.market.lastDemand[good] * cfg.market.perishableBuyFactor - state.market.inventory[good]));
    } else {
      const target = state.market.lastDemand[good] * cfg.market.stockWeeks + 30;
      cap = Math.min(cap, Math.max(0, target - state.market.inventory[good]));
    }
    const affordable = wholesale > 0 ? market.balance / wholesale : cap;
    const bought = Math.max(0, Math.min(cap, affordable));
    state.market.inventory[good] += bought;
    state.market.lastBought[good] += bought;
    market.balance -= bought * wholesale;
    inst.balance += bought * wholesale;
    inst.lastRevenue = bought * wholesale;
    if (bought < output * 0.5 && output > 0) {
      events.push({ tick: state.tick, kind: "unsold", message: `${inst.type} #${inst.id} sold only ${bought.toFixed(0)} of ${output.toFixed(0)} ${good}`, subject: { kind: "institution", id: inst.id } });
    }
  }
  return gdp;
}

/**
 * Update prices, then apply spoilage. Price rises when buyers went unserved (demand exceeded
 * what was sold) and falls when producers could not sell what they offered. Otherwise it holds.
 */
export function clearMarket(state: WorldState): void {
  const cfg = state.config.market;
  state.market.demand.wood += state.market.constructionWood;
  for (const g of GOODS) {
    const demand = state.market.demand[g];
    const sold = state.market.lastSold[g];
    const offered = state.market.lastOffered[g];
    const unmet = demand > 0 ? Math.max(0, demand - sold) / demand : 0;
    const unsold = offered > 0 ? Math.max(0, offered - state.market.lastBought[g]) / offered : 0;
    let delta = 0;
    if (unmet > 0.05) delta = Math.min(1, unmet);
    else if (unsold > 0.1) delta = -Math.min(1, unsold);
    const base = state.config.basePrices[g];
    let p = state.market.prices[g] * (1 + cfg.priceAdjust * delta);
    p = Math.max(base * cfg.minPriceRatio, Math.min(base * cfg.maxPriceRatio, p));
    state.market.prices[g] = p;
    state.market.inventory[g] *= 1 - state.config.spoilage[g];
  }
}
