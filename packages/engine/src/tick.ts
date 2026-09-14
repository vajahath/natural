import { basketFor } from "./config.js";
import { applyAction, advanceProjects } from "./rules/actions.js";
import { publicPayroll } from "./rules/construction.js";
import { loansOutstanding, serviceLoans } from "./rules/bank.js";
import { consume, familyDecisions, matchJobs, migrate, population, train } from "./rules/families.js";
import { familyMembers } from "./rules/helpers.js";
import { institutionDecisions, payWages } from "./rules/institutions.js";
import { clearMarket, planProduction, produceAndSell } from "./rules/production.js";
import type { Action, GameEvent, TickStats, WorldState } from "./types.js";
import { GOODS } from "./types.js";
import { totalMoney } from "./world.js";
import { cloneJson } from "./clone.js";

export interface StepResult {
  state: WorldState;
  events: GameEvent[];
}

/**
 * Advance the world by one week. Pure: the input state is not mutated; the returned state is
 * a fresh object. Same input and actions always give the same output.
 */
export function step(input: WorldState, actions: readonly Action[] = []): StepResult {
  const state = cloneJson(input);
  const events: GameEvent[] = [];
  state.tick++;
  for (const f of Object.values(state.families)) f.lastIncome = 0;
  for (const g of GOODS) {
    state.market.lastDemand[g] = state.market.demand[g];
    state.market.demand[g] = 0;
    state.market.lastWanted[g] = state.market.wanted[g];
    state.market.wanted[g] = 0;
    state.market.lastSold[g] = 0;
    state.market.lastBought[g] = 0;
    state.market.lastOffered[g] = 0;
  }
  state.market.constructionWood = 0;

  for (const a of actions) applyAction(state, a, events);   // 1. player
  advanceProjects(state, events);                            //    public works
  planProduction(state);                                     // 2. producers plan from demand
  matchJobs(state);                                          //    labour market
  const gdp = produceAndSell(state, events);                 //    production
  payWages(state);                                           // 3. wages + income tax
  publicPayroll(state);                                      //    public jobs
  consume(state, events);                                    //    families buy basket
  serviceLoans(state, events);                               // 4. bank
  train(state);
  institutionDecisions(state, events);                       // 5. decisions
  familyDecisions(state, events);
  migrate(state, events);
  clearMarket(state);                                        //    prices adjust
  recordStats(state, gdp);                                   // 6. stats & failure checks
  return { state, events };
}

export function priceIndex(state: WorldState): number {
  const w = basketFor(2);
  let now = 0;
  let base = 0;
  for (const g of GOODS) {
    now += w[g] * state.market.prices[g];
    base += w[g] * state.config.basePrices[g];
  }
  return base > 0 ? now / base : 1;
}

/** GDP at base prices: total output valued at constant prices, immune to price swings. */
function constantPriceGdp(state: WorldState): number {
  let total = 0;
  for (const inst of Object.values(state.institutions)) {
    const good = state.config.institutions[inst.type].produces;
    if (good) total += inst.lastOutput * state.config.basePrices[good];
  }
  return total;
}

function recordStats(state: WorldState, gdp: number): void {
  const fams = Object.values(state.families);
  const pop = population(state);
  state.peakPopulation = Math.max(state.peakPopulation, pop);
  const index = priceIndex(state);
  const realGdp = constantPriceGdp(state);
  const sorted = [...fams].sort((a, b) => a.lastIncome / familyMembers(a) - b.lastIncome / familyMembers(b));
  const third = Math.max(1, Math.floor(sorted.length / 3));
  const mean = (arr: typeof fams, f: (x: (typeof fams)[number]) => number) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
  const low = sorted.slice(0, third);
  const mid = sorted.slice(third, 2 * third);
  const high = sorted.slice(2 * third);
  let workers = 0;
  let unemployed = 0;
  for (const f of fams) {
    workers += f.workers.length;
    unemployed += f.workers.filter((w) => w.jobId === null).length;
  }
  const yearAgo = state.history[state.history.length - state.config.ticksPerYear];
  const inflation = yearAgo ? index / yearAgo.priceIndex - 1 : 0;
  const stats: TickStats = {
    tick: state.tick,
    population: pop,
    families: fams.length,
    gdp,
    priceIndex: index,
    realGdp,
    gdpPerPerson: pop > 0 ? realGdp / pop : 0,
    classIncome: [mean(low, (f) => f.lastIncome), mean(mid, (f) => f.lastIncome), mean(high, (f) => f.lastIncome)],
    classSatisfaction: [mean(low, (f) => f.lastSatisfaction), mean(mid, (f) => f.lastSatisfaction), mean(high, (f) => f.lastSatisfaction)],
    unemployment: workers > 0 ? unemployed / workers : 0,
    moneySupply: totalMoney(state),
    loansOutstanding: loansOutstanding(state),
    treasury: state.treasury.balance,
    prices: { ...state.market.prices },
    inflation,
    avgHappiness: mean(fams, (f) => f.happiness),
    avgLevel: mean(fams, (f) => f.level),
    landRequests: state.landRequests.length,
  };
  state.history.push(stats);
  if (state.history.length > 3000) state.history.shift();

  const fail = state.config.fail;
  state.povertyTicks = stats.classSatisfaction[0] < fail.povertySatisfaction && fams.length > 0 ? state.povertyTicks + 1 : 0;
  state.inflationTicks = inflation > fail.inflation && index > 1.2 ? state.inflationTicks + 1 : 0;
  if (state.failed === null) {
    if (state.povertyTicks >= fail.povertyTicks) state.failed = "poverty: the poorest third missed their basket for too long";
    else if (state.inflationTicks >= fail.inflationTicks) state.failed = "inflation: prices ran away for a year";
    else if (state.peakPopulation > 0 && pop < state.peakPopulation * fail.exodusFraction) state.failed = "exodus: most people left";
  }
}
