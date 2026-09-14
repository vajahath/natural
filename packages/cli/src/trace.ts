import { createWorld, step, institutionViews, latestStats } from "@natural/engine";
import { policies } from "./policies.js";
let s = createWorld(1);
const pol = policies[process.argv[2] ?? "idle"]!;
const T = Number(process.argv[3] ?? 100);
const every = Number(process.argv[4] ?? 4);
for (let t = 0; t < T; t++) {
  s = step(s, pol(s)).state;
  if (s.tick % every !== 0) continue;
  const st = latestStats(s)!;
  const m = s.market;
  const inst = institutionViews(s).map(i => `${i.type.slice(0,4)}L${i.level} ${i.workers}/${i.jobs} w${i.wage.toFixed(0)} $${i.balance.toFixed(0)} out${i.lastOutput.toFixed(0)} u${s.institutions[i.id]!.utilization.toFixed(1)}`).join(" | ");
  console.log(`t${String(s.tick).padStart(3)} px ${m.prices.food.toFixed(1)}/${m.prices.wood.toFixed(1)}/${m.prices.power.toFixed(1)} sup ${m.lastSupply.food.toFixed(0)}/${m.lastSupply.wood.toFixed(0)}/${m.lastSupply.power.toFixed(0)} dem ${m.demand.food.toFixed(0)}/${m.demand.wood.toFixed(0)}/${m.demand.power.toFixed(0)} inv ${m.inventory.food.toFixed(0)}/${m.inventory.wood.toFixed(0)} pub ${(st.unemployment*100).toFixed(0)}% inc ${st.classIncome.map(x=>x.toFixed(0)).join("/")} sat ${st.classSatisfaction.map(x=>x.toFixed(1)).join("/")} tsy ${s.treasury.balance.toFixed(0)} fam ${st.families}`);
  console.log("     " + inst);
}
