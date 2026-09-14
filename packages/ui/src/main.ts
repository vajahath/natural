// Dashboard for the Natural engine. Talks to the engine only through its public API:
// createWorld, step(state, actions), and read-only selectors. Never mutates state directly.
import {
  createWorld,
  step,
  summary,
  latestStats,
  eligiblePlotsFor,
  institutionViews,
  familyViews,
  INSTITUTION_TYPES,
  type Action,
  type GameEvent,
  type InstitutionType,
  type LandRequest,
  type Plot,
  type Scenario,
  type WorldState,
} from "@natural/engine";

// ---------- state held by the UI (the world itself is engine-owned JSON) ----------
let world: WorldState = createWorld(1, {}, "starter");
let scenario: Scenario = "starter";
let pending: Action[] = [];
let selectedPlot: number | null = null;
let selectedRequest: number | null = null;
let playing = false;
let speed = 2; // ticks per second
let log: GameEvent[] = [];
let timer: number | null = null;
let tutorialStep: number | null = 0;
let cell = 46;

const SAVE_KEY = "natural.save";

// ---------- helpers ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "–");
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const money = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));
const esc = (s: string) => s.replace(/"/g, "&quot;");

const INST_LABEL: Record<InstitutionType, string> = { farm: "Farm", logging: "Logging camp", coalPlant: "Coal plant", market: "Market" };
const INST_SHORT: Record<InstitutionType, string> = { farm: "Farm", logging: "Logging", coalPlant: "Coal", market: "Market" };
const INST_COLOR: Record<InstitutionType, string> = { farm: "#65a30d", logging: "#166534", coalPlant: "#374151", market: "#b45309" };
const INST_TIP: Record<InstitutionType, string> = {
  farm: "Grows food. Needs farmland, workers and a little electricity.",
  logging: "Cuts wood. Needs forest. Wood is what every building and home upgrade is made of.",
  coalPlant: "Makes electricity for institutions and homes of level 2 and up. Needs a coal plot.",
  market: "The only shop. Buys from producers, sells to families, keeps a margin. Grows with sales.",
};
const RESOURCE_COLOR: Record<Plot["resource"], string> = { none: "#f3f1ea", farmland: "#e6f0c8", forest: "#cfe3cf", coal: "#dcdcdc" };
const RESOURCE_LABEL: Record<Plot["resource"], string> = { none: "plain land", farmland: "farmland", forest: "forest", coal: "coal" };

function queue(a: Action): void {
  pending.push(a);
  if (!playing) advance(1);
}

function advance(ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const result = step(world, pending);
    pending = [];
    world = result.state;
    log = [...result.events.filter((e) => e.kind !== "unsold").reverse(), ...log].slice(0, 80);
  }
  render();
}

function setPlaying(on: boolean): void {
  playing = on;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (on) timer = window.setInterval(() => advance(1), 1000 / speed);
  render();
}

function newWorld(kind: Scenario, withTutorial: boolean): void {
  scenario = kind;
  world = createWorld(Math.floor(Math.random() * 1e6) + 1, {}, kind);
  pending = [];
  log = [];
  selectedPlot = null;
  selectedRequest = null;
  tutorialStep = withTutorial ? 0 : null;
  setPlaying(false);
}

// ---------- tutorial ----------
interface TutorialStep {
  title: string;
  text: string;
  done: () => boolean;
  waiting?: string;
}

const tutorial: TutorialStep[] = [
  {
    title: "Meet your town",
    text: "You govern a town of <b>one family</b>. It has a <b>farm</b> (green square on the farmland), a <b>market</b> (orange, on the road) and nothing else. Families work, earn, buy food and try to improve their homes. You never control them; you build and set policy. <br><br>Click the farm on the map to inspect it.",
    done: () => selectedPlot !== null && world.plots[selectedPlot]?.owner?.kind === "institution" && world.institutions[world.plots[selectedPlot]!.owner!.id]?.type === "farm",
  },
  {
    title: "Power the farm",
    text: "The farm runs at <b>30% output without electricity</b>. Click a grey <b>coal</b> plot and press <b>Coal plant</b>. Building uses wood from the market and pays families for the labour, so it takes a few weeks.",
    done: () => Object.values(world.institutions).some((i) => i.type === "coalPlant") || world.projects.some((p) => p.institutionType === "coalPlant"),
  },
  {
    title: "Let time run",
    text: "Press <b>Step 1 week</b> a few times, or <b>Play</b>. The dashed outline is the construction site. When the plant opens, watch the farm's output rise in the Institutions table on the right.",
    done: () => Object.values(world.institutions).some((i) => i.type === "coalPlant"),
    waiting: "The coal plant is still under construction. Keep stepping.",
  },
  {
    title: "Grant land",
    text: "Nobody takes land here; they ask for it. Once a family has saved a down payment it files a <b>land request</b>. Press <b>Place</b> on the request, click a plain plot near the road, then <b>Grant</b>. The family pays the land price to your treasury and can start upgrading its home.",
    done: () => Object.values(world.families).some((f) => f.plotIds.length > 0),
    waiting: "No request yet. Step a few more weeks; the family is still saving.",
  },
  {
    title: "Wood for homes",
    text: "Homes and institutions upgrade themselves, but every upgrade is built from <b>wood</b>. The market's wood stock is running down. Click a green <b>forest</b> plot and build a <b>Logging camp</b>.",
    done: () => Object.values(world.institutions).some((i) => i.type === "logging") || world.projects.some((p) => p.institutionType === "logging"),
  },
  {
    title: "Watch it grow",
    text: "Press <b>Skip 1 year</b>. Homes climb from level 1 toward 4, new families arrive when the town is happy, and institutions grow until they hit <b>4 levels per plot</b>, then they request land too. Prices tell you what is scarce: a red price means build more of that good.",
    done: () => (latestStats(world)?.avgLevel ?? 1) >= 1.5 || Object.keys(world.families).length >= 3,
    waiting: "Not yet. Keep the years rolling and grant any land requests that appear.",
  },
  {
    title: "Set policy",
    text: "Your money comes from taxes, rent and land sales. You spend it on buildings and on <b>public jobs</b>: anyone the institutions do not hire works for the state at the public wage. Try moving the <b>Income tax</b> slider and watch the treasury and family incomes.",
    done: () => Math.abs(world.treasury.incomeTax - world.config.initial.incomeTax) > 0.001,
  },
  {
    title: "Your goal",
    text: "The score is <b>real GDP per person</b>: what the town produces, per head, at constant prices. You lose if the poorest third cannot afford their basket for a year, if prices run away, or if most people leave. Keep every class fed, keep prices near 100%, and keep building where the price is red. Good luck.",
    done: () => true,
  },
];

// ---------- layout ----------
$("#app").innerHTML = `
  <div id="tip" hidden></div>
  <header>
    <h1>Natural</h1>
    <div class="stat" data-tip="Simulation time. One tick is one week; 52 weeks make a year."><b id="h-time"></b><span>year · week</span></div>
    <div class="stat" data-tip="Your score. Everything the town produced this week, valued at constant base prices, divided by the number of people. Higher is better."><b id="h-score"></b><span>score: GDP / person</span></div>
    <div class="stat" data-tip="People living in the town. Each family has 2 dependants plus its workers."><b id="h-pop"></b><span>population</span></div>
    <div class="stat" data-tip="Share of workers no institution hired. They work public jobs and the treasury pays their wage. High means the town needs more productive jobs."><b id="h-public"></b><span>in public jobs</span></div>
    <div class="stat" data-tip="Average price of the basic basket compared with the starting prices (1.00 = same). Above 1.2 for a year while rising fast counts as runaway inflation."><b id="h-px"></b><span>price index</span></div>
    <div class="stat" data-tip="Government cash. Income: taxes, rent, land sales, institution surplus. Spending: buildings, public wages, bailouts. Negative means you are printing money, which pushes prices up."><b id="h-tsy"></b><span>treasury</span></div>
    <div class="stat" data-tip="All money in the town: family savings + institution cash + bank reserves + treasury. Only bank loans and treasury deficits create money; selling goods just moves it."><b id="h-money"></b><span>money supply</span></div>
    <div class="stat" data-tip="Mortgages and business loans outstanding. Each loan created new money; repaying destroys it."><b id="h-loans"></b><span>loans</span></div>
    <div class="stat"><b id="h-fail" class="failed"></b><span id="h-fail-label"></span></div>
    <div class="controls">
      <button id="btn-step" data-tip="Advance the simulation by one week.">Step 1 week</button>
      <button id="btn-year" data-tip="Advance 52 weeks at once.">Skip 1 year</button>
      <button id="btn-play" class="primary" data-tip="Run continuously at the chosen speed.">Play</button>
      <select id="speed" data-tip="Weeks per second while playing."><option value="1">1×</option><option value="2" selected>2×</option><option value="5">5×</option><option value="15">15×</option></select>
      <button id="btn-save" data-tip="Keep this world in your browser.">Save</button>
      <button id="btn-load" data-tip="Return to the saved world.">Load</button>
      <span class="scenarios">
        <button id="btn-tutorial" data-tip="Fresh one-family town with the guided run.">New: guided (1 family)</button>
        <button id="btn-town" data-tip="Fresh 24-family town, no guide.">New: small town</button>
      </span>
    </div>
  </header>
  <main>
    <div class="map-wrap">
      <canvas class="map" id="map"></canvas>
      <div class="plot-panel" id="plot-panel"></div>
    </div>
    <div class="charts">
      <div class="chart"><h4 data-tip="Your score over time.">Real GDP per person</h4><canvas id="c-gdp"></canvas></div>
      <div class="chart"><h4 data-tip="Average after-tax weekly income of the poorest, middle and richest third of families.">Weekly income by class (low / mid / high)</h4><canvas id="c-inc"></canvas></div>
      <div class="chart"><h4 data-tip="Each price divided by its starting price. The dashed line is 1.0. Above it: scarce, build more. Far below: glut.">Prices vs base (food / wood / power)</h4><canvas id="c-px"></canvas></div>
      <div class="chart"><h4 data-tip="Treasury cash (blue) and loans outstanding (brown).">Treasury and loans outstanding</h4><canvas id="c-tsy"></canvas></div>
    </div>
  </main>
  <aside>
    <section id="tutorial"></section>
    <section id="requests"></section>
    <section id="dials"></section>
    <section id="classes"></section>
    <section id="institutions"></section>
    <section id="families"></section>
    <section><h3 data-tip="What happened each week: upgrades, arrivals, defaults, land requests.">Events</h3><div class="log" id="log"></div></section>
  </aside>
`;

$("#btn-step").onclick = () => advance(1);
$("#btn-year").onclick = () => advance(world.config.ticksPerYear);
$("#btn-play").onclick = () => setPlaying(!playing);
($("#speed") as HTMLSelectElement).onchange = (e) => {
  speed = Number((e.target as HTMLSelectElement).value);
  if (playing) setPlaying(true);
};
$("#btn-save").onclick = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ world, scenario, tutorialStep }));
  } catch {
    alert("Saving is not available in this browser context.");
  }
  render();
};
$("#btn-load").onclick = () => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return;
  const saved = JSON.parse(raw) as { world: WorldState; scenario?: Scenario; tutorialStep?: number | null };
  world = saved.world;
  scenario = saved.scenario ?? "town";
  tutorialStep = saved.tutorialStep ?? null;
  pending = [];
  log = [];
  selectedPlot = null;
  render();
};
$("#btn-tutorial").onclick = () => newWorld("starter", true);
$("#btn-town").onclick = () => newWorld("town", false);

// ---------- tooltips ----------
const tip = $("#tip");
document.addEventListener("mouseover", (e) => {
  const el = (e.target as HTMLElement).closest?.("[data-tip]") as HTMLElement | null;
  if (!el) return;
  showTip(el.dataset.tip ?? "", e.clientX, e.clientY);
});
document.addEventListener("mouseout", (e) => {
  const el = (e.target as HTMLElement).closest?.("[data-tip]");
  if (el) tip.hidden = true;
});
document.addEventListener("mousemove", (e) => {
  if (!tip.hidden) positionTip(e.clientX, e.clientY);
});
function showTip(text: string, x: number, y: number): void {
  if (!text) return;
  tip.innerHTML = text;
  tip.hidden = false;
  positionTip(x, y);
}
function positionTip(x: number, y: number): void {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  tip.style.left = `${Math.min(x + 14, window.innerWidth - w - 8)}px`;
  tip.style.top = `${y + 16 + h > window.innerHeight ? y - h - 8 : y + 16}px`;
}

// ---------- map ----------
const map = $("#map") as HTMLCanvasElement;
function plotAt(e: MouseEvent): Plot | undefined {
  const r = map.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * world.width);
  const y = Math.floor(((e.clientY - r.top) / r.height) * world.height);
  return world.plots[y * world.width + x];
}
map.addEventListener("click", (e) => {
  const p = plotAt(e);
  if (p) selectedPlot = p.id;
  render();
});
map.addEventListener("mousemove", (e) => {
  const p = plotAt(e);
  if (!p) return;
  showTip(plotTip(p), e.clientX, e.clientY);
});
map.addEventListener("mouseleave", () => (tip.hidden = true));

function plotTip(p: Plot): string {
  const parts = [`<b>${RESOURCE_LABEL[p.resource]}</b> (${p.x}, ${p.y})${p.road ? " · road" : ""}`];
  const project = world.projects.find((pr) => pr.plotId === p.id);
  if (project) parts.push(`Building ${project.institutionType ? INST_LABEL[project.institutionType] : "road"}: wood ${fmt(project.woodDelivered)} of ${fmt(project.woodNeeded)} delivered`);
  if (p.owner?.kind === "institution") {
    const v = institutionViews(world).find((i) => i.id === p.owner!.id);
    if (v) parts.push(`<b>${INST_LABEL[v.type]} #${v.id}</b>, level ${v.level} of ${v.cap} · ${v.workers}/${v.jobs} jobs filled · output ${fmt(v.lastOutput)}/wk`, INST_TIP[v.type]);
  } else if (p.owner?.kind === "family") {
    const v = familyViews(world).find((f) => f.id === p.owner!.id);
    if (v) parts.push(`<b>Home of family #${v.id}</b>, level ${v.level} of ${v.cap} · income ${fmt(v.income)}/wk · savings ${money(v.savings)}`);
  } else if (!project) {
    parts.push(p.resource === "none" ? "Free. Homes can go here." : `Free. A ${p.resource === "farmland" ? "farm" : p.resource === "forest" ? "logging camp" : "coal plant"} can go here.`);
  }
  return parts.join("<br>");
}

function drawMap(): void {
  cell = Math.floor(560 / Math.max(world.width, world.height));
  map.width = world.width * cell;
  map.height = world.height * cell;
  const ctx = map.getContext("2d")!;
  ctx.clearRect(0, 0, map.width, map.height);
  const eligible = new Set<number>();
  const req = selectedRequest !== null ? world.landRequests.find((r) => r.id === selectedRequest) : undefined;
  if (req) for (const p of eligiblePlotsFor(world, req)) eligible.add(p.id);
  const projects = new Map(world.projects.map((p) => [p.plotId, p]));
  const road = (x: number, y: number) => x >= 0 && y >= 0 && x < world.width && y < world.height && !!world.plots[y * world.width + x]?.road;

  // ground
  for (const p of world.plots) {
    ctx.fillStyle = RESOURCE_COLOR[p.resource] ?? "#fff";
    ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
    ctx.strokeStyle = "#ebe8df";
    ctx.strokeRect(p.x * cell + 0.5, p.y * cell + 0.5, cell, cell);
  }
  // roads as connected strips
  const w = Math.max(4, Math.round(cell / 3));
  ctx.fillStyle = "#b8b2a4";
  for (const p of world.plots) {
    if (!p.road) continue;
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    const neighbours = [road(p.x + 1, p.y), road(p.x - 1, p.y), road(p.x, p.y + 1), road(p.x, p.y - 1)];
    ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
    if (neighbours[0]) ctx.fillRect(cx, cy - w / 2, cell / 2 + 1, w);
    if (neighbours[1]) ctx.fillRect(p.x * cell, cy - w / 2, cell / 2, w);
    if (neighbours[2]) ctx.fillRect(cx - w / 2, cy, w, cell / 2 + 1);
    if (neighbours[3]) ctx.fillRect(cx - w / 2, p.y * cell, w, cell / 2);
    if (!neighbours.some(Boolean)) ctx.fillRect(p.x * cell + 3, cy - w / 2, cell - 6, w);
  }
  // overlays
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of world.plots) {
    const x = p.x * cell;
    const y = p.y * cell;
    if (eligible.has(p.id)) {
      ctx.fillStyle = "rgba(37,99,235,0.16)";
      ctx.fillRect(x, y, cell, cell);
    }
    const proj = projects.get(p.id);
    if (proj) {
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = "#b45309";
      ctx.font = `${Math.max(8, cell * 0.22)}px system-ui`;
      ctx.fillText(cell >= 40 ? "building" : "…", x + cell / 2, y + cell / 2);
    }
    if (p.owner?.kind === "institution") {
      const inst = world.institutions[p.owner.id];
      if (!inst) continue;
      ctx.fillStyle = INST_COLOR[inst.type] ?? "#000";
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      ctx.fillStyle = "#fff";
      if (cell >= 40) {
        ctx.font = `bold ${Math.round(cell * 0.24)}px system-ui`;
        ctx.fillText(INST_SHORT[inst.type], x + cell / 2, y + cell * 0.38);
        ctx.font = `${Math.round(cell * 0.2)}px system-ui`;
        ctx.fillText(`Lv ${inst.level}`, x + cell / 2, y + cell * 0.68);
      } else {
        ctx.font = `bold ${Math.round(cell * 0.4)}px system-ui`;
        ctx.fillText(`${INST_SHORT[inst.type][0]}${inst.level}`, x + cell / 2, y + cell / 2);
      }
    } else if (p.owner?.kind === "family") {
      const fam = world.families[p.owner.id];
      if (!fam) continue;
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(x + 5, y + 5, cell - 10, cell - 10);
      ctx.fillStyle = "#1e3a8a";
      if (cell >= 40) {
        ctx.font = `bold ${Math.round(cell * 0.22)}px system-ui`;
        ctx.fillText("Home", x + cell / 2, y + cell * 0.38);
        ctx.font = `${Math.round(cell * 0.2)}px system-ui`;
        ctx.fillText(`Lv ${fam.level}`, x + cell / 2, y + cell * 0.68);
      } else {
        ctx.font = `bold ${Math.round(cell * 0.38)}px system-ui`;
        ctx.fillText(String(fam.level), x + cell / 2, y + cell / 2);
      }
    }
  }
  if (selectedPlot !== null) {
    const p = world.plots[selectedPlot];
    if (p) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x * cell + 1.5, p.y * cell + 1.5, cell - 3, cell - 3);
      ctx.lineWidth = 1;
    }
  }
}

function renderPlotPanel(): void {
  const el = $("#plot-panel");
  const legend = `<div class="legend">
      <span data-tip="Only farms can be built here."><i style="background:#e6f0c8"></i>farmland</span>
      <span data-tip="Only logging camps can be built here."><i style="background:#cfe3cf"></i>forest</span>
      <span data-tip="Only coal plants can be built here."><i style="background:#dcdcdc"></i>coal</span>
      <span data-tip="Institutions on plots without a road produce at half output."><i style="background:#b8b2a4"></i>road</span>
      <span data-tip="A family's home. The number is its level (1–4 per plot)."><i style="background:#93c5fd"></i>Home Lv n</span>
      <span data-tip="Farm, Logging, Coal, Market. Lv is the level; output and jobs scale with it."><i style="background:#65a30d"></i>institution Lv n</span>
    </div>`;
  if (selectedPlot === null) {
    el.innerHTML = `<h3>Click a plot on the map</h3><p class="help">Hover anything on this page for an explanation. The map shows land, roads, homes and institutions. Institutions and homes upgrade themselves up to 4 levels per plot, then ask you for land.</p>${legend}`;
    return;
  }
  const p = world.plots[selectedPlot]!;
  const project = world.projects.find((pr) => pr.plotId === p.id);
  let body = `<h3>Plot (${p.x}, ${p.y}) — ${RESOURCE_LABEL[p.resource]}${p.road ? ", road" : ", no road"}</h3>`;
  if (project) body += `<div>Under construction: ${project.institutionType ? INST_LABEL[project.institutionType] : "road"} · wood ${fmt(project.woodDelivered)}/${fmt(project.woodNeeded)} delivered. Construction waits for wood in the market.</div>`;
  if (p.owner?.kind === "institution") {
    const v = institutionViews(world).find((i) => i.id === p.owner!.id)!;
    body += `<div><b>${INST_LABEL[v.type]} #${v.id}</b> · ${INST_TIP[v.type]}</div>
      <table style="margin-top:6px">
        <tr><td data-tip="Current level and the cap for its land. Max level = 4 × plots.">Level</td><td class="num">${v.level} / ${v.cap}</td></tr>
        <tr><td data-tip="Workers hired out of jobs offered. Jobs shrink when output goes unsold.">Jobs filled</td><td class="num">${v.workers} / ${v.jobs}</td></tr>
        <tr><td data-tip="Weekly wage per worker. Rises when jobs stay unfilled, falls when losing money, never below the public wage.">Wage</td><td class="num">${fmt(v.wage)}</td></tr>
        <tr><td data-tip="Units produced last week.">Output / week</td><td class="num">${fmt(v.lastOutput)}</td></tr>
        <tr><td data-tip="Cash on hand. Surplus above a reserve is remitted to your treasury; shortfalls are covered by it.">Cash</td><td class="num">${money(v.balance)}</td></tr>
        ${v.hasRequest ? `<tr><td colspan="2"><b>At its land cap and waiting for a plot.</b></td></tr>` : ""}
      </table>`;
  } else if (p.owner?.kind === "family") {
    const v = familyViews(world).find((f) => f.id === p.owner!.id)!;
    body += `<div><b>Home of family #${v.id}</b></div>
      <table style="margin-top:6px">
        <tr><td data-tip="Home level sets what the family consumes each week and how much it spends.">Home level</td><td class="num">${v.level} / ${v.cap}</td></tr>
        <tr><td data-tip="Expected weekly after-tax income of all its workers.">Income / week</td><td class="num">${fmt(v.income)}</td></tr>
        <tr><td data-tip="Savings in the bank.">Savings</td><td class="num">${money(v.savings)}</td></tr>
        <tr><td data-tip="Mortgage and upgrade loans still owed.">Debt</td><td class="num">${money(v.debt)}</td></tr>
        <tr><td data-tip="Workers with an institution job / workers in the family.">Employed</td><td class="num">${v.employed} / ${v.workers}</td></tr>
        <tr><td data-tip="0 to 1. Needs met and having a job. Unhappy families leave; happy towns attract newcomers.">Happiness</td><td class="num">${fmt(v.happiness, 2)}</td></tr>
      </table>`;
  } else if (!project) {
    body += `<div>Free plot. Build here:</div><div class="build-row">`;
    body += `<button data-build="road" ${p.road ? "disabled" : ""} data-tip="Roads let institutions on this plot work at full output. Cost: ${world.config.road.wood} wood + ${world.config.road.labor} labour.">Road</button>`;
    for (const t of INSTITUTION_TYPES) {
      const spec = world.config.institutions[t];
      const ok = spec.resource === "none" || spec.resource === p.resource;
      body += `<button data-build="${t}" ${ok ? "" : "disabled"} data-tip="${esc(INST_TIP[t])} Cost: ${spec.buildWood} wood + ${spec.buildLabor} labour.${ok ? "" : ` Needs ${RESOURCE_LABEL[spec.resource]}.`}">${INST_LABEL[t]}</button>`;
    }
    body += `</div>`;
    const req = selectedRequest !== null ? world.landRequests.find((r) => r.id === selectedRequest) : undefined;
    if (req) {
      const ok = eligiblePlotsFor(world, req).some((e) => e.id === p.id);
      body += `<div class="build-row"><button class="primary" data-grant="${req.id}" ${ok ? "" : "disabled"}>Grant request #${req.id} here for ${fmt(req.money)}</button></div>`;
    } else if (world.landRequests.length > 0) {
      body += `<p class="help">To place a land request here, press <b>Place</b> on a request first.</p>`;
    }
  }
  el.innerHTML = body + legend;
  el.querySelectorAll<HTMLButtonElement>("button[data-build]").forEach((b) => {
    b.onclick = () => {
      const kind = b.dataset.build!;
      if (kind === "road") queue({ type: "buildRoad", plotId: p.id });
      else queue({ type: "buildInstitution", institutionType: kind as InstitutionType, plotId: p.id });
    };
  });
  el.querySelectorAll<HTMLButtonElement>("button[data-grant]").forEach((b) => {
    b.onclick = () => {
      queue({ type: "grantLand", requestId: Number(b.dataset.grant), plotId: p.id });
      selectedRequest = null;
    };
  });
}

// ---------- side panel ----------
function renderTutorial(): void {
  const el = $("#tutorial");
  if (tutorialStep === null) {
    el.innerHTML = "";
    return;
  }
  const s = tutorial[tutorialStep]!;
  const done = s.done();
  const last = tutorialStep === tutorial.length - 1;
  el.innerHTML = `<div class="tutorial">
      <h3>${s.title} <small>step ${tutorialStep + 1} of ${tutorial.length}</small></h3>
      <p>${s.text}</p>
      <div>${done ? `<span class="done">✓ Done</span>` : `<span class="todo">${s.waiting && tutorialStep > 0 ? s.waiting : "Waiting for you…"}</span>`}</div>
      <div class="row" style="margin-top:8px">
        <button id="tut-next" class="primary" ${done ? "" : "disabled"}>${last ? "Finish" : "Next"}</button>
        <button id="tut-skip">${last ? "Close" : "Skip step"}</button>
        <button id="tut-exit" data-tip="Hide the guide. Start it again with “New: guided”.">Exit guide</button>
      </div>
    </div>`;
  $("#tut-next").onclick = () => {
    tutorialStep = last ? null : tutorialStep! + 1;
    render();
  };
  $("#tut-skip").onclick = () => {
    tutorialStep = last ? null : tutorialStep! + 1;
    render();
  };
  $("#tut-exit").onclick = () => {
    tutorialStep = null;
    render();
  };
}

function requesterLabel(r: LandRequest): string {
  if (r.requester.kind === "family") return `Family #${r.requester.id} · ${r.purpose === "home" ? "wants to buy a home plot" : "wants a bigger home"}`;
  const inst = world.institutions[r.requester.id];
  return inst ? `${INST_LABEL[inst.type]} #${inst.id} · at land cap, wants to expand` : `Institution #${r.requester.id}`;
}

function renderRequests(): void {
  const el = $("#requests");
  const rows = world.landRequests
    .map(
      (r) => `<div class="req">
        <div>${requesterLabel(r)}<br><small>offers ${fmt(r.money)} · waiting ${world.tick - r.tick} wk</small></div>
        <div><button data-pick="${r.id}" class="${selectedRequest === r.id ? "primary" : ""}" data-tip="Then click a highlighted plot on the map and press Grant.">${selectedRequest === r.id ? "Pick plot…" : "Place"}</button> <button data-reject="${r.id}" data-tip="Turn the request down. They will ask again later.">✕</button></div>
      </div>`,
    )
    .join("");
  el.innerHTML = `<h3 data-tip="Families and institutions cannot take land. They ask, offering the land price, and you choose the plot.">Land requests (${world.landRequests.length})</h3>${rows || '<div class="help">None right now. A family files one when it has saved a down payment; an institution when it reaches 4 levels per plot.</div>'}`;
  el.querySelectorAll<HTMLButtonElement>("button[data-pick]").forEach((b) => {
    b.onclick = () => {
      selectedRequest = selectedRequest === Number(b.dataset.pick) ? null : Number(b.dataset.pick);
      render();
    };
  });
  el.querySelectorAll<HTMLButtonElement>("button[data-reject]").forEach((b) => {
    b.onclick = () => queue({ type: "rejectLand", requestId: Number(b.dataset.reject) });
  });
}

function dial(id: string, label: string, tipText: string, value: number, min: number, max: number, stepSize: number, show: (v: number) => string): string {
  return `<div class="dial"><span data-tip="${esc(tipText)}">${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${stepSize}" value="${value}"><b id="${id}-v">${show(value)}</b></div>`;
}

function renderDials(): void {
  const t = world.treasury;
  const el = $("#dials");
  el.innerHTML = `<h3 data-tip="Your levers. Changes apply next week.">Policy</h3>
    ${dial("d-income", "Income tax", "Share of every wage withheld for the treasury. High tax fills the treasury but slows family savings and upgrades.", t.incomeTax, 0, 0.6, 0.01, pct)}
    ${dial("d-sales", "Sales tax", "Added on top of every market purchase. Raises prices families pay.", t.salesTax, 0, 0.4, 0.01, pct)}
    ${dial("d-land", "Land price", "What a family or institution pays the treasury per plot. Higher price: more income, slower home ownership.", t.landPrice, 0, 2000, 25, (v) => fmt(v))}
    ${dial("d-rate", "Base interest rate", "Yearly rate the bank charges on mortgages and business loans, plus a risk premium. High rates block upgrades.", world.bank.baseRate, 0, 0.3, 0.005, (v) => `${(v * 100).toFixed(1)}%`)}
    ${dial("d-public", "Public job wage", "Weekly pay for every worker no institution hired. Acts as the minimum wage: institutions must pay more to hire. Zero means unemployment.", t.publicWage, 0, 60, 1, (v) => fmt(v))}
    <div class="help">Subsidies paid so far to institutions that could not cover wages: <b>${money(t.subsidies)}</b>.</div>`;
  const bind = (id: string, mk: (v: number) => Action, show: (v: number) => string) => {
    const input = $(`#${id}`) as HTMLInputElement;
    input.oninput = () => ($(`#${id}-v`).textContent = show(Number(input.value)));
    input.onchange = () => queue(mk(Number(input.value)));
  };
  bind("d-income", (v) => ({ type: "setIncomeTax", rate: v }), pct);
  bind("d-sales", (v) => ({ type: "setSalesTax", rate: v }), pct);
  bind("d-land", (v) => ({ type: "setLandPrice", price: v }), (v) => fmt(v));
  bind("d-rate", (v) => ({ type: "setBaseRate", rate: v }), (v) => `${(v * 100).toFixed(1)}%`);
  bind("d-public", (v) => ({ type: "setPublicWage", wage: v }), (v) => fmt(v));
}

function renderClasses(): void {
  const st = latestStats(world);
  const el = $("#classes");
  if (!st) {
    el.innerHTML = "";
    return;
  }
  const names = ["Poorest third", "Middle third", "Richest third"];
  el.innerHTML = `<h3 data-tip="Families sorted by income per person and split into thirds. You lose if the poorest third cannot afford its basket for a year.">Classes and prices</h3>
    <table><tr><th>Class</th><th class="num" data-tip="Average after-tax income per family per week.">Income / wk</th><th class="num" data-tip="Share of the weekly basket (food, wood, power) they could actually buy. Below 60% is poverty.">Needs met</th></tr>
    ${names.map((n, i) => `<tr><td>${n}</td><td class="num">${fmt(st.classIncome[i]!)}</td><td class="num" style="color:${st.classSatisfaction[i]! < 0.6 ? "var(--bad)" : "inherit"}">${pct(st.classSatisfaction[i]!)}</td></tr>`).join("")}
    </table>
    <table style="margin-top:6px"><tr><th>Good</th><th class="num" data-tip="Current market price per unit.">Price</th><th class="num" data-tip="Price compared with the starting price. Red: scarce, build more. Orange: glut.">vs base</th><th class="num" data-tip="Units the market has in stock. Food spoils; power cannot be stored.">Stock</th></tr>
    ${(["food", "wood", "power"] as const)
      .map((g) => {
        const ratio = world.market.prices[g] / world.config.basePrices[g];
        const color = ratio > 1.3 ? "var(--bad)" : ratio < 0.7 ? "var(--warn)" : "inherit";
        return `<tr><td>${g}</td><td class="num">${fmt(world.market.prices[g], 1)}</td><td class="num" style="color:${color}">${fmt(ratio * 100)}%</td><td class="num">${fmt(world.market.inventory[g])}</td></tr>`;
      })
      .join("")}
    </table>
    <div class="help"><span data-tip="Average home level across families (1 to 4 per plot).">Avg home level ${fmt(st.avgLevel, 2)}</span> · <span data-tip="Average family happiness, 0 to 1.">happiness ${fmt(st.avgHappiness, 2)}</span> · <span data-tip="Price index now versus one year ago.">inflation ${pct(st.inflation)}</span> · <span data-tip="Bank's own money: interest earned minus loans written off.">bank reserves ${money(world.bank.balance)}</span></div>`;
}

function renderInstitutions(): void {
  const el = $("#institutions");
  const rows = institutionViews(world)
    .map(
      (v) => `<tr data-tip="${esc(INST_TIP[v.type])}"><td>${INST_LABEL[v.type]} #${v.id}${v.hasRequest ? " ⚑" : ""}</td><td class="num">${v.level}/${v.cap}</td><td class="num">${v.workers}/${v.jobs}</td><td class="num">${fmt(v.wage)}</td><td class="num">${fmt(v.lastOutput)}</td><td class="num">${money(v.balance)}</td></tr>`,
    )
    .join("");
  el.innerHTML = `<h3 data-tip="State-owned enterprises. They hire, produce, set wages and upgrade on their own. ⚑ means waiting for land.">Institutions (${Object.keys(world.institutions).length})</h3>
    <table><tr><th>Name</th><th class="num" data-tip="Level / cap. Cap is 4 per plot.">Lvl</th><th class="num" data-tip="Workers hired / jobs offered.">Jobs</th><th class="num" data-tip="Weekly wage per worker.">Wage</th><th class="num" data-tip="Units produced last week.">Out/wk</th><th class="num" data-tip="Cash on hand.">Cash</th></tr>${rows}</table>
    ${world.projects.length ? `<div class="help">Under construction: ${world.projects.map((p) => `${p.institutionType ? INST_LABEL[p.institutionType] : "road"} (wood ${fmt(p.woodDelivered)}/${fmt(p.woodNeeded)})`).join(", ")}</div>` : ""}`;
}

function renderFamilies(): void {
  const fams = familyViews(world);
  const byLevel = new Map<number, number>();
  let renters = 0;
  for (const f of fams) {
    byLevel.set(f.level, (byLevel.get(f.level) ?? 0) + 1);
    if (f.renter) renters++;
  }
  const levels = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `level ${l}: ${n}`).join(" · ");
  $("#families").innerHTML = `<h3 data-tip="Every family wants a better home. Level 1 to 4 per plot; each level eats and spends more.">Families (${fams.length})</h3><div>${levels || "–"}</div><div class="help"><span data-tip="Renters live in government housing at level 1 and pay rent. They cannot level up until they buy a plot.">${renters} renting government housing</span>.</div>`;
}

function renderLog(): void {
  $("#log").innerHTML = log.map((e) => `<div>wk ${e.tick}: ${e.message}</div>`).join("");
}

// ---------- charts ----------
function lineChart(id: string, series: { values: number[]; color: string }[], opts: { zero?: boolean; ref?: number } = {}): void {
  const c = $(id) as HTMLCanvasElement;
  const w = (c.width = c.clientWidth * devicePixelRatio);
  const h = (c.height = c.clientHeight * devicePixelRatio);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (all.length < 2) return;
  const min = Math.min(...all, opts.zero ? 0 : Infinity, opts.ref ?? Infinity);
  let max = Math.max(...all, opts.ref ?? -Infinity);
  if (max === min) max = min + 1;
  const pad = 4 * devicePixelRatio;
  const X = (i: number, n: number) => pad + (i / Math.max(1, n - 1)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
  if (opts.ref !== undefined) {
    ctx.strokeStyle = "#d4d0c6";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, Y(opts.ref));
    ctx.lineTo(w, Y(opts.ref));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (min < 0 && max > 0) {
    ctx.strokeStyle = "#e5e1d8";
    ctx.beginPath();
    ctx.moveTo(0, Y(0));
    ctx.lineTo(w, Y(0));
    ctx.stroke();
  }
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    s.values.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i, s.values.length), Y(v)) : ctx.lineTo(X(i, s.values.length), Y(v))));
    ctx.stroke();
  }
  ctx.fillStyle = "#6b7280";
  ctx.font = `${10 * devicePixelRatio}px system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fmt(max, 1), pad, pad + 10 * devicePixelRatio);
  ctx.fillText(fmt(min, 1), pad, h - pad - 2);
}

function renderCharts(): void {
  const hist = world.history.slice(-520);
  lineChart("#c-gdp", [{ values: hist.map((s) => s.gdpPerPerson), color: "#2563eb" }], { zero: true });
  lineChart(
    "#c-inc",
    [
      { values: hist.map((s) => s.classIncome[0]), color: "#dc2626" },
      { values: hist.map((s) => s.classIncome[1]), color: "#d97706" },
      { values: hist.map((s) => s.classIncome[2]), color: "#16a34a" },
    ],
    { zero: true },
  );
  lineChart(
    "#c-px",
    [
      { values: hist.map((s) => s.prices.food / world.config.basePrices.food), color: "#65a30d" },
      { values: hist.map((s) => s.prices.wood / world.config.basePrices.wood), color: "#166534" },
      { values: hist.map((s) => s.prices.power / world.config.basePrices.power), color: "#374151" },
    ],
    { ref: 1 },
  );
  lineChart(
    "#c-tsy",
    [
      { values: hist.map((s) => s.treasury), color: "#2563eb" },
      { values: hist.map((s) => s.loansOutstanding), color: "#b45309" },
    ],
    { zero: true },
  );
}

// ---------- render ----------
function render(): void {
  const s = summary(world);
  const st = s.stats;
  $("#h-time").textContent = `Y${s.year} · W${s.week}`;
  $("#h-score").textContent = fmt(s.score, 1);
  $("#h-pop").textContent = st ? String(st.population) : "–";
  $("#h-public").textContent = st ? pct(st.unemployment) : "–";
  $("#h-px").textContent = st ? fmt(st.priceIndex, 2) : "–";
  $("#h-tsy").textContent = money(s.treasury);
  $("#h-money").textContent = st ? money(st.moneySupply) : "–";
  $("#h-loans").textContent = st ? money(st.loansOutstanding) : "–";
  $("#h-fail").textContent = s.failed ? "FAILED" : "";
  $("#h-fail-label").textContent = s.failed ?? "";
  $("#btn-play").textContent = playing ? "Pause" : "Play";
  tip.hidden = true;
  drawMap();
  renderPlotPanel();
  renderTutorial();
  renderRequests();
  renderDials();
  renderClasses();
  renderInstitutions();
  renderFamilies();
  renderLog();
  renderCharts();
}

window.addEventListener("resize", renderCharts);
render();
