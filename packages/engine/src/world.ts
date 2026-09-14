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
    lastFactor: 1,
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

export type Scenario = "starter" | "town";

interface Layout {
  width: number;
  height: number;
  resource: (x: number, y: number) => Plot["resource"];
  road: (x: number, y: number) => boolean;
  institutions: { type: InstitutionType; x: number; y: number; level: number; balance: number }[];
  /** Plots handed to the initial owner families, in order. */
  ownerPlots: { x: number; y: number }[];
  initial: Partial<Config["initial"]>;
  marketInventory: { food: number; wood: number };
}

const layouts: Record<Scenario, Layout> = {
  // One family, one farm, one market, one short road. Everything else is the player's to build.
  starter: {
    width: 12,
    height: 12,
    resource: (x, y) => (x >= 1 && x <= 4 && y >= 1 && y <= 4 ? "farmland" : x >= 7 && x <= 10 && y >= 1 && y <= 4 ? "forest" : x >= 7 && x <= 10 && y >= 7 && y <= 10 ? "coal" : "none"),
    road: (x, y) => y === 6 && x >= 2 && x <= 9,
    institutions: [
      { type: "farm", x: 3, y: 4, level: 1, balance: 400 },
      { type: "market", x: 6, y: 6, level: 1, balance: 600 },
    ],
    ownerPlots: [],
    initial: { width: 12, height: 12, families: 1, ownerFamilies: 0, treasury: 5000, bankBalance: 1000, marketBalance: 600, renterSavings: 60, landPrice: 200 },
    marketInventory: { food: 30, wood: 80 },
  },
  town: {
    width: 20,
    height: 20,
    resource: (x, y) => (x >= 2 && x <= 7 && y >= 2 && y <= 7 ? "farmland" : x >= 12 && x <= 18 && y >= 2 && y <= 8 ? "forest" : x >= 13 && x <= 18 && y >= 13 && y <= 18 ? "coal" : "none"),
    road: (x, y) => y === 9 || (x === 9 && y >= 4 && y <= 15),
    institutions: [
      { type: "farm", x: 3, y: 3, level: 2, balance: 1500 },
      { type: "logging", x: 14, y: 4, level: 1, balance: 800 },
      { type: "coalPlant", x: 15, y: 15, level: 1, balance: 800 },
      { type: "market", x: 9, y: 9, level: 2, balance: 4000 },
    ],
    ownerPlots: Array.from({ length: 15 }, (_, i) => ({ x: 4 + (i % 5), y: 11 + Math.floor(i / 5) })),
    initial: {},
    marketInventory: { food: 120, wood: 60 },
  },
};

export function createWorld(seed = 1, overrides: Partial<Config> = {}, scenario: Scenario = "town"): WorldState {
  const layout = layouts[scenario];
  const config: Config = { ...defaultConfig, ...overrides, initial: { ...defaultConfig.initial, ...layout.initial, ...(overrides.initial ?? {}) } };
  const { width, height } = layout;
  const plots: Plot[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      plots.push({ id: y * width + x, x, y, resource: layout.resource(x, y), road: layout.road(x, y), owner: null });
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
      inventory: { ...layout.marketInventory, power: 0 },
      demand: { food: 0, wood: 0, power: 0 },
      wanted: { food: 0, wood: 0, power: 0 },
      lastWanted: { food: 10, wood: 5, power: 5 },
      lastDemand: { food: 10, wood: 5, power: 5 },
      lastSupply: { food: 10, wood: 5, power: 5 },
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

  for (const spec of layout.institutions) {
    const id = plotIndex(state, spec.x, spec.y);
    state.plots[id]!.road = true;
    const inst = newInstitution(state, spec.type, id, spec.level, spec.balance);
    state.institutions[inst.id] = inst;
    if (spec.type === "market") state.market.institutionId = inst.id;
  }

  for (let n = 0; n < config.initial.families; n++) {
    const isOwner = n < config.initial.ownerFamilies && n < layout.ownerPlots.length;
    const workerCount = scenario === "starter" ? 2 : 1 + (nextRandom(state) < 0.3 ? 1 : 0);
    const workers: Worker[] = [];
    for (let w = 0; w < workerCount; w++) {
      const sector = INSTITUTION_TYPES[randomInt(state, INSTITUTION_TYPES.length)] ?? "farm";
      workers.push(newWorker(config, sector, 1));
    }
    const fam = newFamily(state, workers, isOwner ? config.initial.ownerSavings : config.initial.renterSavings, isOwner ? 2 : 1);
    if (isOwner) {
      const { x, y } = layout.ownerPlots[n]!;
      const pid = plotIndex(state, x, y);
      fam.plotIds.push(pid);
      state.plots[pid]!.owner = { kind: "family", id: fam.id };
    }
    state.families[fam.id] = fam;
  }

  state.seedMoney = totalMoney(state);
  for (const g of GOODS) state.market.lastSold[g] = 0;
  return state;
}
