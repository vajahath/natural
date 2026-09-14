import { describe, expect, it } from "vitest";
import { createWorld, step, moneyInvariantGap, levelCap, defaultConfig, latestStats, eligiblePlotsFor, type Action, type WorldState } from "../src/index.js";

function run(state: WorldState, ticks: number, actions: (s: WorldState) => Action[] = () => []): WorldState {
  for (let i = 0; i < ticks; i++) state = step(state, actions(state)).state;
  return state;
}

describe("money", () => {
  it("is conserved except for bank lending and migration", () => {
    let s = createWorld(7);
    for (let i = 0; i < 300; i++) {
      s = step(s, i % 10 === 0 ? [{ type: "buildRoad", plotId: 15 + i }] : []).state;
      expect(Math.abs(moneyInvariantGap(s))).toBeLessThan(1e-6);
    }
  });

  it("is created by loans and destroyed by repayment", () => {
    let s = createWorld(3);
    s = run(s, 150, (st) => st.landRequests.slice(0, 3).map((r) => ({ type: "grantLand" as const, requestId: r.id, plotId: eligiblePlotsFor(st, r)[0]!.id })));
    const stats = latestStats(s)!;
    expect(stats.loansOutstanding).toBeGreaterThan(0);
    expect(Math.abs(moneyInvariantGap(s))).toBeLessThan(1e-6);
  });
});

describe("stocks", () => {
  it("never go negative", () => {
    let s = createWorld(11);
    for (let i = 0; i < 300; i++) {
      s = step(s).state;
      for (const g of ["food", "wood", "power"] as const) expect(s.market.inventory[g]).toBeGreaterThanOrEqual(-1e-9);
      for (const f of Object.values(s.families)) expect(f.savings).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe("levels and land", () => {
  it("cap level at 4 per plot", () => {
    expect(levelCap(defaultConfig, 1)).toBe(4);
    expect(levelCap(defaultConfig, 2)).toBe(8);
    let s = createWorld(5);
    s = run(s, 400);
    for (const i of Object.values(s.institutions)) expect(i.level).toBeLessThanOrEqual(4 * i.plotIds.length);
    for (const f of Object.values(s.families)) expect(f.level).toBeLessThanOrEqual(4 * Math.max(1, f.plotIds.length));
  });

  it("queue land requests until the player grants a plot", () => {
    let s = createWorld(5);
    s = run(s, 200);
    expect(s.landRequests.length).toBeGreaterThan(0);
    const req = s.landRequests[0]!;
    // Make sure the requester can pay outright so the bank's decision does not matter here.
    if (req.requester.kind === "family") s.families[req.requester.id]!.savings = req.money + 100;
    else s.institutions[req.requester.id]!.balance = req.money + 100;
    const plot = eligiblePlotsFor(s, req)[0]!;
    const next = step(s, [{ type: "grantLand", requestId: req.id, plotId: plot.id }]).state;
    expect(next.landRequests.find((r) => r.id === req.id)).toBeUndefined();
    expect(next.plots[plot.id]!.owner).toEqual(req.requester);
    expect(Math.abs(moneyInvariantGap(next))).toBeLessThan(1e-6);
  });
});

describe("determinism", () => {
  it("gives identical state for the same seed and actions", () => {
    const a = run(createWorld(42), 100, (s) => (s.tick === 10 ? [{ type: "setIncomeTax", rate: 0.2 }] : []));
    const b = run(createWorld(42), 100, (s) => (s.tick === 10 ? [{ type: "setIncomeTax", rate: 0.2 }] : []));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate its input", () => {
    const s = createWorld(1);
    const snapshot = JSON.stringify(s);
    step(s, [{ type: "setSalesTax", rate: 0.3 }]);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
