import type { Good, InstitutionType, Resource } from "./types.js";

export interface InstitutionSpec {
  produces: Good | null;
  /** Plot resource the institution must sit on ("none" = any plot). */
  resource: Resource;
  /** Units produced per week at level 1 with a fully skilled crew. */
  baseOutput: number;
  jobsPerLevel: number;
  /** Power units consumed per level per week. */
  powerPerLevel: number;
  buildWood: number;
  buildLabor: number;
  /** Money cost of upgrading from level 1 to 2; grows by upgradeCostGrowth per level. */
  upgradeCost: number;
  initialWage: number;
}

export interface Config {
  ticksPerYear: number;
  basePrices: Record<Good, number>;
  institutions: Record<InstitutionType, InstitutionSpec>;
  /** Lowest share of capacity a producer keeps running when demand is gone. */
  minUtilization: number;
  /** Max level per unit of land. */
  levelsPerPlot: number;
  upgradeCostGrowth: number;
  /** Share of any construction cost that is wood (priced at base price); the rest is labour. */
  constructionWoodShare: number;
  road: { wood: number; labor: number };
  roadlessOutputFactor: number;
  spoilage: Record<Good, number>;
  market: {
    margin: number;
    priceAdjust: number;
    minPriceRatio: number;
    maxPriceRatio: number;
    /** Market buys perishable goods only up to lastDemand × this. */
    perishableBuyFactor: number;
    /** Market keeps this many weeks of demand in stock for storable goods. */
    stockWeeks: number;
    reserveWeeks: number;
  };
  family: {
    homeUpgradeCost: number;
    homeUpgradeGrowth: number;
    downPaymentRatio: number;
    rent: number;
    upgradeIncomeRatio: number;
    /** A family may also upgrade from wealth: savings after the upgrade must cover this many weeks of the next basket. */
    upgradeWealthWeeks: number;
    missedBasketDowngrade: number;
    satisfiedThreshold: number;
    skillStart: number;
    skillGainPerTick: number;
    emigrateHappiness: number;
    emigrateTicks: number;
    /** Families with this many weeks of basket in savings do not emigrate. */
    emigrateSavingsWeeks: number;
    immigrationRate: number;
    happinessSmoothing: number;
  };
  bank: {
    reserveRatio: number;
    riskPremium: number;
    maxPaymentToIncome: number;
    loanWeeks: number;
    missedToDefault: number;
  };
  wage: {
    raiseStep: number;
    cutStep: number;
    min: number;
    unfilledTicksToRaise: number;
    lowBalanceWeeks: number;
    unpaidTicksToQuit: number;
  };
  institution: {
    reserveWeeks: number;
    remitRate: number;
  };
  fail: {
    povertySatisfaction: number;
    povertyTicks: number;
    inflation: number;
    inflationTicks: number;
    exodusFraction: number;
  };
  initial: {
    width: number;
    height: number;
    families: number;
    ownerFamilies: number;
    treasury: number;
    bankBalance: number;
    marketBalance: number;
    renterSavings: number;
    ownerSavings: number;
    incomeTax: number;
    salesTax: number;
    landPrice: number;
    baseRate: number;
    publicWage: number;
  };
  /** Max public/construction labour paid to one unemployed family per payment; the rest is spread over everyone. */
  laborCapPerFamily: number;
  /** Labour money one construction worker delivers per week on government projects. */
  constructionRatePerWorker: number;
  /** Units a market can sell per week per level; it upgrades when throughput nears this. */
  marketCapacityPerLevel: number;
}

export const defaultConfig: Config = {
  ticksPerYear: 52,
  basePrices: { food: 8, wood: 8, power: 5 },
  institutions: {
    farm: { produces: "food", resource: "farmland", baseOutput: 40, jobsPerLevel: 6, powerPerLevel: 2, buildWood: 40, buildLabor: 900, upgradeCost: 800, initialWage: 30 },
    logging: { produces: "wood", resource: "forest", baseOutput: 30, jobsPerLevel: 5, powerPerLevel: 1, buildWood: 0, buildLabor: 700, upgradeCost: 700, initialWage: 30 },
    coalPlant: { produces: "power", resource: "coal", baseOutput: 30, jobsPerLevel: 3, powerPerLevel: 0, buildWood: 40, buildLabor: 1500, upgradeCost: 1500, initialWage: 32 },
    market: { produces: null, resource: "none", baseOutput: 0, jobsPerLevel: 2, powerPerLevel: 1, buildWood: 30, buildLabor: 800, upgradeCost: 600, initialWage: 30 },
  },
  minUtilization: 0.15,
  levelsPerPlot: 4,
  upgradeCostGrowth: 1.4,
  constructionWoodShare: 0.3,
  road: { wood: 10, labor: 200 },
  roadlessOutputFactor: 0.5,
  spoilage: { food: 0.3, wood: 0, power: 1 },
  market: { margin: 0.25, priceAdjust: 0.08, minPriceRatio: 0.3, maxPriceRatio: 5, perishableBuyFactor: 1.1, stockWeeks: 6, reserveWeeks: 6 },
  family: {
    homeUpgradeCost: 600,
    homeUpgradeGrowth: 1.5,
    downPaymentRatio: 0.3,
    rent: 4,
    upgradeIncomeRatio: 0.9,
    upgradeWealthWeeks: 13,
    missedBasketDowngrade: 8,
    satisfiedThreshold: 0.8,
    skillStart: 0.5,
    skillGainPerTick: 0.7 / 26,
    emigrateHappiness: 0.25,
    emigrateTicks: 8,
    emigrateSavingsWeeks: 13,
    immigrationRate: 0.15,
    happinessSmoothing: 0.3,
  },
  bank: { reserveRatio: 0.1, riskPremium: 0.03, maxPaymentToIncome: 0.35, loanWeeks: 260, missedToDefault: 8 },
  wage: { raiseStep: 0.05, cutStep: 0.02, min: 10, unfilledTicksToRaise: 2, lowBalanceWeeks: 4, unpaidTicksToQuit: 4 },
  institution: { reserveWeeks: 8, remitRate: 0.5 },
  fail: { povertySatisfaction: 0.5, povertyTicks: 52, inflation: 0.25, inflationTicks: 52, exodusFraction: 0.4 },
  initial: {
    width: 20,
    height: 20,
    families: 24,
    ownerFamilies: 8,
    treasury: 20000,
    bankBalance: 2000,
    marketBalance: 4000,
    renterSavings: 100,
    ownerSavings: 400,
    incomeTax: 0.1,
    salesTax: 0.05,
    landPrice: 300,
    baseRate: 0.05,
    publicWage: 24,
  },
  laborCapPerFamily: 40,
  constructionRatePerWorker: 80,
  marketCapacityPerLevel: 150,
};

/** Weekly needs basket for a family at the given level. */
export function basketFor(level: number): Record<Good, number> {
  return { food: 1.5 + level, wood: 0.5 * level, power: Math.max(0, 2 * (level - 1)) };
}

export function institutionUpgradeCost(cfg: Config, type: InstitutionType, level: number): number {
  return cfg.institutions[type].upgradeCost * Math.pow(cfg.upgradeCostGrowth, level - 1);
}

export function homeUpgradeCost(cfg: Config, level: number): number {
  return cfg.family.homeUpgradeCost * Math.pow(cfg.family.homeUpgradeGrowth, level - 1);
}

export function levelCap(cfg: Config, landUnits: number): number {
  return cfg.levelsPerPlot * Math.max(1, landUnits);
}
