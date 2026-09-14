import { eligiblePlotsFor, type Action, type WorldState } from "@natural/engine";

export type Policy = (state: WorldState) => Action[];

/** Does nothing. Treasury hoards; the economy should stagnate. */
export const idle: Policy = () => [];

/** Punitive taxes and rates, no public services, never grants land, never builds. Should collapse. */
export const bad: Policy = (s) =>
  s.tick === 1
    ? [
        { type: "setIncomeTax", rate: 0.6 },
        { type: "setSalesTax", rate: 0.3 },
        { type: "setBaseRate", rate: 0.25 },
        { type: "setPublicWage", wage: 0 },
      ]
    : [];

/**
 * A reasonable mayor: grants land promptly, builds a producer when its good gets expensive,
 * stimulates when unemployment is high, and keeps the budget roughly balanced with tax.
 */
export const sensible: Policy = (s) => {
  const actions: Action[] = [];
  if (s.tick === 1) actions.push({ type: "setIncomeTax", rate: 0.12 }, { type: "setSalesTax", rate: 0.05 }, { type: "setBaseRate", rate: 0.04 }, { type: "setPublicWage", wage: 20 });

  const used = new Set<number>();
  for (const req of s.landRequests) {
    const plot = eligiblePlotsFor(s, req).find((p) => !used.has(p.id) && (req.requester.kind === "institution" || p.resource === "none"));
    if (!plot) continue;
    used.add(plot.id);
    actions.push({ type: "grantLand", requestId: req.id, plotId: plot.id });
  }

  const stats = s.history[s.history.length - 1];
  const unemployment = stats?.unemployment ?? 0;
  if (s.tick % 13 === 0) {
    // Supply side: build the producer of the most expensive good, if any is expensive.
    const goods = ["food", "wood", "power"] as const;
    const ratio = (g: (typeof goods)[number]) => s.market.prices[g] / s.config.basePrices[g];
    const expensive = [...goods].sort((a, b) => ratio(b) - ratio(a)).filter((g) => ratio(g) > 1.15);
    const map = { food: "farm", wood: "logging", power: "coalPlant" } as const;
    if (s.projects.length === 0 && s.treasury.balance > 3000) {
      for (const g of expensive) {
        const type = map[g];
        const need = s.config.institutions[type].resource;
        const plot = s.plots.find((p) => p.owner === null && p.resource === need && !used.has(p.id));
        if (plot) {
          used.add(plot.id);
          actions.push({ type: "buildInstitution", institutionType: type, plotId: plot.id });
          break;
        }
      }
    }
    // Demand side: public spending against unemployment, tax against deficits.
    const inflation = stats?.inflation ?? 0;
    const wage = s.treasury.publicWage;
    if (inflation > 0.1 && wage > 15) actions.push({ type: "setPublicWage", wage: wage - 1 });
    else if (unemployment > 0.15 && wage < 22) actions.push({ type: "setPublicWage", wage: wage + 1 });
    const tax = s.treasury.incomeTax;
    if (s.treasury.balance < -10000 && tax < 0.3) actions.push({ type: "setIncomeTax", rate: tax + 0.02 });
    else if (s.treasury.balance > 15000 && tax > 0.05) actions.push({ type: "setIncomeTax", rate: tax - 0.02 });
  }
  return actions;
};

export const policies: Record<string, Policy> = { idle, sensible, bad };
