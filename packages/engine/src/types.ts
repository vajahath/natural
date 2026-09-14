// All engine state is plain JSON: no classes, no functions, fully serializable.

export type Good = "food" | "wood" | "power";
export const GOODS: readonly Good[] = ["food", "wood", "power"] as const;

export type Resource = "none" | "farmland" | "forest" | "coal";

export type InstitutionType = "farm" | "logging" | "coalPlant" | "market";
export const INSTITUTION_TYPES: readonly InstitutionType[] = ["farm", "logging", "coalPlant", "market"] as const;

/** A worker's sector is the institution type they work in. */
export type Sector = InstitutionType;

export type Owner = { kind: "family"; id: number } | { kind: "institution"; id: number };

export interface Plot {
  id: number;
  x: number;
  y: number;
  resource: Resource;
  road: boolean;
  owner: Owner | null;
}

export interface Worker {
  /** Productivity per sector, 0..1. Grows while working in that sector. */
  skills: Record<Sector, number>;
  /** Institution id currently employing this worker, or null. */
  jobId: number | null;
  /** Ticks of unpaid wages at the current job. */
  unpaidTicks: number;
}

export interface Family {
  id: number;
  level: number;
  /** Empty = renter in government housing. */
  plotIds: number[];
  savings: number;
  workers: Worker[];
  happiness: number;
  /** Consecutive ticks the basket was not met. */
  missedBasket: number;
  loanIds: number[];
  /** Pending land request id, if any. */
  requestId: number | null;
  /** Diagnostics from the last tick. */
  lastIncome: number;
  lastSatisfaction: number;
  unhappyTicks: number;
}

export interface Institution {
  id: number;
  type: InstitutionType;
  plotIds: number[];
  level: number;
  balance: number;
  wage: number;
  /** Share of capacity the institution runs at (0.3..1). Falls when output goes unsold. */
  utilization: number;
  /** Ticks with open jobs nobody filled. */
  unfilledTicks: number;
  loanIds: number[];
  requestId: number | null;
  lastOutput: number;
  lastRevenue: number;
  lastWageBill: number;
  /** Ticks in a row the institution could not pay full wages. */
  missedWages: number;
}

export interface Loan {
  id: number;
  borrower: Owner;
  principal: number;
  weeklyPayment: number;
  /** Weekly interest rate. */
  rate: number;
  missed: number;
}

export interface Bank {
  balance: number;
  /** Annual base rate set by the player, e.g. 0.05. */
  baseRate: number;
  reserveRatio: number;
  loans: Record<number, Loan>;
  /** Cumulative written-off principal (diagnostic). */
  writeOffs: number;
  /** Cumulative interest earned (diagnostic). */
  interestEarned: number;
}

export interface Treasury {
  balance: number;
  incomeTax: number;
  salesTax: number;
  landPrice: number;
  /** Weekly wage the state pays every worker who has no institution job (public services). */
  publicWage: number;
  /** Cumulative wages the state covered for institutions that could not pay (diagnostic). */
  subsidies: number;
}

export interface Market {
  institutionId: number;
  prices: Record<Good, number>;
  inventory: Record<Good, number>;
  /** Demand accumulating during the current tick. */
  demand: Record<Good, number>;
  /** Demand seen over the whole previous tick (used to decide how much perishable stock to buy). */
  lastDemand: Record<Good, number>;
  /** Units producers offered this tick (plus carried stock). */
  lastSupply: Record<Good, number>;
  /** Units producers brought to market this tick. */
  lastOffered: Record<Good, number>;
  /** Units the market actually bought from producers this tick. */
  lastBought: Record<Good, number>;
  /** Units sold this tick (retail + institutional). */
  lastSold: Record<Good, number>;
  /** Largest wood requirement of a construction job blocked by empty stock this tick. */
  constructionWood: number;
}

export interface LandRequest {
  id: number;
  requester: Owner;
  purpose: "home" | "expand";
  money: number;
  tick: number;
}

export interface Project {
  id: number;
  kind: "road" | "institution";
  institutionType?: InstitutionType;
  plotId: number;
  woodNeeded: number;
  woodDelivered: number;
  laborCost: number;
  laborPaid: boolean;
}

export interface TickStats {
  tick: number;
  population: number;
  families: number;
  gdp: number;
  priceIndex: number;
  realGdp: number;
  gdpPerPerson: number;
  /** Mean weekly after-tax income of the bottom, middle and top third of families. */
  classIncome: [number, number, number];
  classSatisfaction: [number, number, number];
  /** Share of workers in public jobs (no institution job). */
  unemployment: number;
  moneySupply: number;
  loansOutstanding: number;
  treasury: number;
  prices: Record<Good, number>;
  inflation: number;
  avgHappiness: number;
  avgLevel: number;
  landRequests: number;
}

export interface WorldState {
  tick: number;
  seed: number;
  rng: number;
  config: import("./config.js").Config;
  width: number;
  height: number;
  plots: Plot[];
  families: Record<number, Family>;
  institutions: Record<number, Institution>;
  market: Market;
  bank: Bank;
  treasury: Treasury;
  landRequests: LandRequest[];
  projects: Project[];
  nextId: number;
  /** Money that existed at creation. */
  seedMoney: number;
  /** Net money that entered (+) or left (-) with migrants. */
  externalFlow: number;
  peakPopulation: number;
  history: TickStats[];
  failed: string | null;
  /** Consecutive-tick counters used for failure detection. */
  povertyTicks: number;
  inflationTicks: number;
}

export type Action =
  | { type: "buildInstitution"; institutionType: InstitutionType; plotId: number }
  | { type: "buildRoad"; plotId: number }
  | { type: "grantLand"; requestId: number; plotId: number }
  | { type: "rejectLand"; requestId: number }
  | { type: "setIncomeTax"; rate: number }
  | { type: "setSalesTax"; rate: number }
  | { type: "setLandPrice"; price: number }
  | { type: "setBaseRate"; rate: number }
  | { type: "setPublicWage"; wage: number };

export interface GameEvent {
  tick: number;
  kind: string;
  message: string;
  subject?: Owner;
}
