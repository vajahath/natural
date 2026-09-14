import { createWorld, step, summary, latestStats, type WorldState } from "@natural/engine";
import { policies } from "./policies.js";

const years = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1);
const ticks = years * 52;

function runPolicy(name: string): { state: WorldState; rows: string[] } {
  const policy = policies[name]!;
  let state = createWorld(seed);
  const rows: string[] = [];
  for (let t = 0; t < ticks; t++) {
    state = step(state, policy(state)).state;
    if (state.tick % 52 === 0) {
      const st = latestStats(state)!;
      rows.push(
        [
          `y${String(state.tick / 52).padStart(2)}`,
          `gdp/p ${st.gdpPerPerson.toFixed(1).padStart(6)}`,
          `pop ${String(st.population).padStart(4)}`,
          `unemp ${(st.unemployment * 100).toFixed(0).padStart(3)}%`,
          `lvl ${st.avgLevel.toFixed(2)}`,
          `inc ${st.classIncome.map((c) => c.toFixed(0).padStart(4)).join("/")}`,
          `sat ${st.classSatisfaction.map((c) => c.toFixed(2)).join("/")}`,
          `px ${st.priceIndex.toFixed(2)}`,
          `M ${st.moneySupply.toFixed(0).padStart(7)}`,
          `loans ${st.loansOutstanding.toFixed(0).padStart(6)}`,
          `tsy ${st.treasury.toFixed(0).padStart(7)}`,
          `req ${st.landRequests}`,
        ].join("  "),
      );
    }
  }
  return { state, rows };
}

const results: Record<string, number> = {};
for (const name of Object.keys(policies)) {
  const { state, rows } = runPolicy(name);
  const s = summary(state);
  console.log(`\n=== ${name} (seed ${seed}, ${years} years) ===`);
  for (const r of rows) console.log(r);
  console.log(`score ${s.score.toFixed(2)}  failed: ${s.failed ?? "no"}  money gap ${s.moneyGap.toExponential(1)}  institutions ${Object.keys(state.institutions).length}`);
  results[name] = s.score;
}
console.log("\nfinal real GDP per person:", Object.entries(results).map(([k, v]) => `${k}=${v.toFixed(2)}`).join("  "));
