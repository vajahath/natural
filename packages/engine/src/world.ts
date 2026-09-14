import { defaultConfig, type Config } from "./config.js";
import { nextRandom, randomInt } from "./rng.js";
import type { Family, Institution, InstitutionType, Plot, Sector, Worker, WorldState } from "./types.js";
import { GOODS, INSTITUTION_TYPES } from "./types.js";

export function plotIndex(state: WorldState, x: number, y: number): number {
  return y * state.width + x;
}

export function newId(state: WorldState): number {
  return state.nextId++;
}

function freshSkills(sector: Sector | null, level: number, start: number): Record<Sector, number> {
  const skills = {} as Record<Sector, number>;
  for (const s of INSTITUTION_TYPES) skills[s] = s === sector ? level : start;
  return skills;
}

export function newWorker(cfg: Config, sector: Sector | null, skill: number): Worker {
  return { skills: freshSkills(sector, skill, cfg.family.skillStart), jobId: null, unpaidTicks: 0 };
}

export function newFamily(state: WorldState, workers: Worker[], savings: number, level = 1): Family {
  return {
    id: newId(state),
    level,
    plotIds: [],
    savings,
    workers,
    happiness: 0.6,
    missedBasket: 0,
    loanIds: [],
    requestId: null,
    lastIncome: 0,
    lastSatisfaction: 1,
    unhappyTicks: 0,
  };
}

export function newInstitution(state: WorldState, type: InstitutionType, plotId: number, level: number, balance: number): Institution {
  const inst: Institution = {
    id: newId(state),
    type,
    plotIds: [plotId],
    level,
    balance,
    wage: state.config.institutions[type].initialWage,
    utilization: 1,
    unfilledTicks: 0,
    loanIds: [],
    requestId: null,
    lastOutput: 0,
    lastRevenue: 0,
    lastWageBill: 0,
    missedWages: 0,
  };
  const plot = state.plots[plotId];
  if (plot) plot.owner = { kind: "institution", id: inst.id };
  return inst;
}

/** Sum of every account. Treasury may be negative (deficit financed by money creation). */
export function totalMoney(state: WorldState): number {
  let sum = state.treasury.balance + state.bank.balance;
  for (const f of Object.values(state.families)) sum += f.savings;
  for (const i of Object.values(state.institutions)) sum += i.balance;
  return sum;
}

export function createWorld(seed = 1, overrides: Partial<Config> = {}): WorldState {
  const config: Config = { ...defaultConfig, ...overrides };
  const { width, height } = config.initial;
  const plots: Plot[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let resource: Plot["resource"] = "none";
      if (x >= 2 && x <= 7 && y >= 2 && y <= 7) resource = "farmland";
      else if (x >= 12 && x <= 18 && y >= 2 && y <= 8) resource = "forest";
      else if (x >= 13 && x <= 18 && y >= 13 && y <= 18) resource = "coal";
      const road = x === 9 || x === 10 || y === 9 || y === 10;
      plots.push({ id: y * width + x, x, y, resource, road, owner: null });
    }
  }

  const state: WorldState = {
    tick: 0,
    seed,
    rng: seed >>> 0,
    config,
    width,
    height,
    plots,
    families: {},
    institutions: {},
    market: {
      institutionId: -1,
      prices: { ...config.basePrices },
      inventory: { food: 120, wood: 60, power: 0 },
      demand: { food: 0, wood: 0, power: 0 },
      lastDemand: { food: 100, wood: 20, power: 20 },
      lastSupply: { food: 100, wood: 20, power: 20 },
      lastOffered: { food: 0, wood: 0, power: 0 },
      lastBought: { food: 0, wood: 0, power: 0 },
      lastSold: { food: 0, wood: 0, power: 0 },
      constructionWood: 0,
    },
    bank: { balance: config.initial.bankBalance, baseRate: config.initial.baseRate, reserveRatio: config.bank.reserveRatio, loans: {}, writeOffs: 0, interestEarned: 0 },
    treasury: { balance: config.initial.treasury, incomeTax: config.initial.incomeTax, salesTax: config.initial.salesTax, landPrice: config.initial.landPrice, publicWage: config.initial.publicWage, subsidies: 0 },
    landRequests: [],
    projects: [],
    nextId: 1,
    seedMoney: 0,
    externalFlow: 0,
    peakPopulation: 0,
    history: [],
    failed: null,
    povertyTicks: 0,
    inflationTicks: 0,
  };

  const place = (type: InstitutionType, x: number, y: number, level: number, balance: number) => {
    const id = plotIndex(state, x, y);
    const plot = state.plots[id]!;
    plot.road = true;
    const inst = newInstitution(state, type, id, level, balance);
    state.institutions[inst.id] = inst;
    return inst;
  };
  place("farm", 3, 3, 2, 1500);
  place("logging", 14, 4, 1, 800);
  place("coalPlant", 15, 15, 1, 800);
  const market = place("market", 9, 9, 2, config.initial.marketBalance);
  state.market.institutionId = market.id;

  // Families: owners on plots south of the main road, renters in government housing.
  const ownerPlots: number[] = [];
  for (let y = 11; y <= 13; y++) for (let x = 4; x <= 8; x++) ownerPlots.push(plotIndex(state, x, y));
  for (let n = 0; n < config.initial.families; n++) {
    const isOwner = n < config.initial.ownerFamilies;
    const workerCount = 1 + (nextRandom(state) < 0.3 ? 1 : 0);
    const workers: Worker[] = [];
    for (let w = 0; w < workerCount; w++) {
      const sector = INSTITUTION_TYPES[randomInt(state, INSTITUTION_TYPES.length)] ?? "farm";
      workers.push(newWorker(config, sector, 1));
    }
    const fam = newFamily(state, workers, isOwner ? config.initial.ownerSavings : config.initial.renterSavings, isOwner ? 2 : 1);
    if (isOwner) {
      const pid = ownerPlots[n]!;
      fam.plotIds.push(pid);
      state.plots[pid]!.owner = { kind: "family", id: fam.id };
    }
    state.families[fam.id] = fam;
  }

  state.seedMoney = totalMoney(state);
  for (const g of GOODS) state.market.lastSold[g] = 0;
  return state;
}
