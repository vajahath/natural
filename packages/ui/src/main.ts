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
  type WorldState,
} from "@natural/engine";

// ---------- state held by the UI (the world itself is engine-owned JSON) ----------
let world: WorldState = createWorld(1);
let pending: Action[] = [];
let selectedPlot: number | null = null;
let selectedRequest: number | null = null;
let playing = false;
let speed = 2; // ticks per second
let log: GameEvent[] = [];
let timer: number | null = null;

const SAVE_KEY = "natural.save";
const CELL = 26;

// ---------- helpers ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "–");
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const money = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));

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

// ---------- layout ----------
$("#app").innerHTML = `
  <header>
    <h1>Natural</h1>
    <div class="stat"><b id="h-time"></b><span>year · week</span></div>
    <div class="stat"><b id="h-score"></b><span>score: real GDP / person</span></div>
    <div class="stat"><b id="h-pop"></b><span>population</span></div>
    <div class="stat"><b id="h-public"></b><span>in public jobs</span></div>
    <div class="stat"><b id="h-px"></b><span>price index</span></div>
    <div class="stat"><b id="h-tsy"></b><span>treasury</span></div>
    <div class="stat"><b id="h-money"></b><span>money supply</span></div>
    <div class="stat"><b id="h-loans"></b><span>loans</span></div>
    <div class="stat"><b id="h-fail" class="failed"></b><span id="h-fail-label"></span></div>
    <div class="controls">
      <button id="btn-step">Step 1 week</button>
      <button id="btn-year">Skip 1 year</button>
      <button id="btn-play" class="primary">Play</button>
      <select id="speed"><option value="1">1×</option><option value="2" selected>2×</option><option value="5">5×</option><option value="15">15×</option></select>
      <button id="btn-save">Save</button>
      <button id="btn-load">Load</button>
      <button id="btn-reset">New world</button>
    </div>
  </header>
  <main>
    <div class="map-wrap">
      <canvas class="map" id="map"></canvas>
      <div class="plot-panel" id="plot-panel"></div>
    </div>
    <div class="charts">
      <div class="chart"><h4>Real GDP per person</h4><canvas id="c-gdp"></canvas></div>
      <div class="chart"><h4>Weekly income by class (low / mid / high)</h4><canvas id="c-inc"></canvas></div>
      <div class="chart"><h4>Prices vs base (food / wood / power)</h4><canvas id="c-px"></canvas></div>
      <div class="chart"><h4>Treasury and loans outstanding</h4><canvas id="c-tsy"></canvas></div>
    </div>
  </main>
  <aside>
    <section id="requests"></section>
    <section id="dials"></section>
    <section id="classes"></section>
    <section id="institutions"></section>
    <section id="families"></section>
    <section><h3>Events</h3><div class="log" id="log"></div></section>
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
    localStorage.setItem(SAVE_KEY, JSON.stringify(world));
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
  if (raw) {
    world = JSON.parse(raw) as WorldState;
    pending = [];
    log = [];
    render();
  }
};
$("#btn-reset").onclick = () => {
  if (!confirm("Start a new world? Unsaved progress is lost.")) return;
  world = createWorld(Math.floor(Math.random() * 1e6));
  pending = [];
  log = [];
  selectedPlot = null;
  render();
};

// ---------- map ----------
const map = $("#map") as HTMLCanvasElement;
map.width = world.width * CELL;
map.height = world.height * CELL;
map.addEventListener("click", (e) => {
  const r = map.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * world.width);
  const y = Math.floor(((e.clientY - r.top) / r.height) * world.height);
  selectedPlot = y * world.width + x;
  render();
});

const RESOURCE_COLOR: Record<Plot["resource"], string> = { none: "#f3f1ea", farmland: "#e6f0c8", forest: "#cfe3cf", coal: "#dcdcdc" };
const INST_COLOR: Record<InstitutionType, string> = { farm: "#65a30d", logging: "#166534", coalPlant: "#374151", market: "#b45309" };
const INST_LABEL: Record<InstitutionType, string> = { farm: "Farm", logging: "Logging camp", coalPlant: "Coal plant", market: "Market" };

function drawMap(): void {
  const ctx = map.getContext("2d")!;
  ctx.clearRect(0, 0, map.width, map.height);
  const eligible = new Set<number>();
  const req = selectedRequest !== null ? world.landRequests.find((r) => r.id === selectedRequest) : undefined;
  if (req) for (const p of eligiblePlotsFor(world, req)) eligible.add(p.id);
  const projects = new Map(world.projects.map((p) => [p.plotId, p]));
  for (const p of world.plots) {
    const x = p.x * CELL;
    const y = p.y * CELL;
    ctx.fillStyle = RESOURCE_COLOR[p.resource] ?? "#fff";
    ctx.fillRect(x, y, CELL, CELL);
    if (p.road) {
      ctx.fillStyle = "#c9c4b8";
      ctx.fillRect(x, y + CELL / 2 - 2, CELL, 4);
      ctx.fillRect(x + CELL / 2 - 2, y, 4, CELL);
    }
    if (eligible.has(p.id)) {
      ctx.fillStyle = "rgba(37,99,235,0.18)";
      ctx.fillRect(x, y, CELL, CELL);
    }
    const proj = projects.get(p.id);
    if (proj) {
      ctx.strokeStyle = "#d97706";
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      ctx.setLineDash([]);
    }
    if (p.owner?.kind === "institution") {
      const inst = world.institutions[p.owner.id];
      if (inst) {
        ctx.fillStyle = INST_COLOR[inst.type] ?? "#000";
        ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`${inst.type[0]!.toUpperCase()}${inst.level}`, x + CELL / 2, y + CELL / 2 + 4);
      }
    } else if (p.owner?.kind === "family") {
      const fam = world.families[p.owner.id];
      if (fam) {
        ctx.fillStyle = "#93c5fd";
        ctx.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "bold 9px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(String(fam.level), x + CELL / 2, y + CELL / 2 + 3);
      }
    }
    ctx.strokeStyle = "#ebe8df";
    ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
  }
  if (selectedPlot !== null) {
    const p = world.plots[selectedPlot]!;
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.lineWidth = 1;
  }
}

function renderPlotPanel(): void {
  const el = $("#plot-panel");
  const legend = `<div class="legend">
      <span><i style="background:#e6f0c8"></i>farmland</span><span><i style="background:#cfe3cf"></i>forest</span>
      <span><i style="background:#dcdcdc"></i>coal</span><span><i style="background:#c9c4b8"></i>road</span>
      <span><i style="background:#93c5fd"></i>home (level)</span><span><i style="background:#65a30d"></i>institution (level)</span>
    </div>
    <p class="help">Click a plot. Institutions and homes upgrade themselves up to 4 levels per plot, then request land. You decide where it goes. Watch prices: an expensive good means "build more of it".</p>`;
  if (selectedPlot === null) {
    el.innerHTML = `<h3>No plot selected</h3>${legend}`;
    return;
  }
  const p = world.plots[selectedPlot]!;
  const project = world.projects.find((pr) => pr.plotId === p.id);
  let body = `<h3>Plot (${p.x}, ${p.y}) — ${p.resource === "none" ? "plain land" : p.resource}${p.road ? ", road" : ", no road"}</h3>`;
  if (project) body += `<div>Under construction: ${project.institutionType ?? project.kind} (wood ${fmt(project.woodDelivered)}/${fmt(project.woodNeeded)})</div>`;
  if (p.owner?.kind === "institution") {
    const v = institutionViews(world).find((i) => i.id === p.owner!.id)!;
    body += `<div><b>${INST_LABEL[v.type]} #${v.id}</b> level ${v.level}/${v.cap} · workers ${v.workers}/${v.jobs} · wage ${fmt(v.wage)} · balance ${money(v.balance)} · output ${fmt(v.lastOutput)}/wk${v.hasRequest ? " · <b>wants land</b>" : ""}</div>`;
  } else if (p.owner?.kind === "family") {
    const v = familyViews(world).find((f) => f.id === p.owner!.id)!;
    body += `<div><b>Family #${v.id}</b> home level ${v.level}/${v.cap} · savings ${money(v.savings)} · income ${fmt(v.income)}/wk · debt ${money(v.debt)} · happiness ${fmt(v.happiness, 2)}</div>`;
  } else if (!project) {
    body += `<div>Free. Build here:</div><div class="build-row">`;
    body += `<button data-build="road" ${p.road ? "disabled" : ""}>Road (wood ${world.config.road.wood}, ${world.config.road.labor})</button>`;
    for (const t of INSTITUTION_TYPES) {
      const spec = world.config.institutions[t];
      const ok = spec.resource === "none" || spec.resource === p.resource;
      body += `<button data-build="${t}" ${ok ? "" : "disabled"} title="${ok ? "" : `needs ${spec.resource}`}">${INST_LABEL[t]} (wood ${spec.buildWood}, ${spec.buildLabor})</button>`;
    }
    body += `</div>`;
    const req = selectedRequest !== null ? world.landRequests.find((r) => r.id === selectedRequest) : undefined;
    if (req) {
      const ok = eligiblePlotsFor(world, req).some((e) => e.id === p.id);
      body += `<div class="build-row"><button class="primary" data-grant="${req.id}" ${ok ? "" : "disabled"}>Grant request #${req.id} here for ${fmt(req.money)}</button></div>`;
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
function requesterLabel(r: LandRequest): string {
  if (r.requester.kind === "family") return `Family #${r.requester.id} (${r.purpose === "home" ? "wants to buy a home plot" : "wants a bigger home"})`;
  const inst = world.institutions[r.requester.id];
  return inst ? `${INST_LABEL[inst.type]} #${inst.id} (at land cap, wants to expand)` : `Institution #${r.requester.id}`;
}

function renderRequests(): void {
  const el = $("#requests");
  const rows = world.landRequests
    .map(
      (r) => `<div class="req">
        <div>${requesterLabel(r)}<br><small>offers ${fmt(r.money)} · waiting ${world.tick - r.tick} wk</small></div>
        <div><button data-pick="${r.id}" class="${selectedRequest === r.id ? "primary" : ""}">${selectedRequest === r.id ? "Pick plot…" : "Place"}</button> <button data-reject="${r.id}">✕</button></div>
      </div>`,
    )
    .join("");
  el.innerHTML = `<h3>Land requests (${world.landRequests.length})</h3>${rows || '<div class="help">None. Requests appear when a family saves a down payment or an institution hits its land cap.</div>'}`;
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

function dial(id: string, label: string, value: number, min: number, max: number, stepSize: number, show: (v: number) => string): string {
  return `<div class="dial"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${stepSize}" value="${value}"><b id="${id}-v">${show(value)}</b></div>`;
}

function renderDials(): void {
  const t = world.treasury;
  const el = $("#dials");
  el.innerHTML = `<h3>Policy</h3>
    ${dial("d-income", "Income tax", t.incomeTax, 0, 0.6, 0.01, pct)}
    ${dial("d-sales", "Sales tax", t.salesTax, 0, 0.4, 0.01, pct)}
    ${dial("d-land", "Land price", t.landPrice, 0, 2000, 25, (v) => fmt(v))}
    ${dial("d-rate", "Base interest rate", world.bank.baseRate, 0, 0.3, 0.005, (v) => `${(v * 100).toFixed(1)}%`)}
    ${dial("d-public", "Public job wage", t.publicWage, 0, 60, 1, (v) => fmt(v))}
    <div class="help">Public jobs pay everyone the market does not hire. Institutions must beat that wage. The treasury covers unpaid wages of loss-making institutions (subsidies so far: ${money(t.subsidies)}).</div>`;
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
  el.innerHTML = `<h3>Classes and prices</h3>
    <table><tr><th>Class</th><th class="num">Income / wk</th><th class="num">Needs met</th></tr>
    ${names.map((n, i) => `<tr><td>${n}</td><td class="num">${fmt(st.classIncome[i]!)}</td><td class="num" style="color:${st.classSatisfaction[i]! < 0.6 ? "var(--bad)" : "inherit"}">${pct(st.classSatisfaction[i]!)}</td></tr>`).join("")}
    </table>
    <table style="margin-top:6px"><tr><th>Good</th><th class="num">Price</th><th class="num">vs base</th><th class="num">Stock</th></tr>
    ${(["food", "wood", "power"] as const)
      .map((g) => {
        const ratio = world.market.prices[g] / world.config.basePrices[g];
        const color = ratio > 1.3 ? "var(--bad)" : ratio < 0.7 ? "var(--warn)" : "inherit";
        return `<tr><td>${g}</td><td class="num">${fmt(world.market.prices[g], 1)}</td><td class="num" style="color:${color}">${fmt(ratio * 100)}%</td><td class="num">${fmt(world.market.inventory[g])}</td></tr>`;
      })
      .join("")}
    </table>
    <div class="help">Avg home level ${fmt(st.avgLevel, 2)} · happiness ${fmt(st.avgHappiness, 2)} · inflation (YoY) ${pct(st.inflation)} · bank reserves ${money(world.bank.balance)} · write-offs ${money(world.bank.writeOffs)}</div>`;
}

function renderInstitutions(): void {
  const el = $("#institutions");
  const rows = institutionViews(world)
    .map(
      (v) => `<tr><td>${INST_LABEL[v.type]} #${v.id}${v.hasRequest ? " ⚑" : ""}</td><td class="num">${v.level}/${v.cap}</td><td class="num">${v.workers}/${v.jobs}</td><td class="num">${fmt(v.wage)}</td><td class="num">${fmt(v.lastOutput)}</td><td class="num">${money(v.balance)}</td></tr>`,
    )
    .join("");
  el.innerHTML = `<h3>Institutions (${Object.keys(world.institutions).length})</h3>
    <table><tr><th>Name</th><th class="num">Lvl</th><th class="num">Jobs</th><th class="num">Wage</th><th class="num">Out/wk</th><th class="num">Cash</th></tr>${rows}</table>
    ${world.projects.length ? `<div class="help">Under construction: ${world.projects.map((p) => `${p.institutionType ?? p.kind} (wood ${fmt(p.woodDelivered)}/${fmt(p.woodNeeded)})`).join(", ")}</div>` : ""}`;
}

function renderFamilies(): void {
  const fams = familyViews(world);
  const byLevel = new Map<number, number>();
  let renters = 0;
  for (const f of fams) {
    byLevel.set(f.level, (byLevel.get(f.level) ?? 0) + 1);
    if (f.renter) renters++;
  }
  const levels = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([l, n]) => `L${l}: ${n}`).join(" · ");
  $("#families").innerHTML = `<h3>Families (${fams.length})</h3><div>${levels || "–"}</div><div class="help">${renters} renting government housing (cannot level up until they buy a plot).</div>`;
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
  let min = Math.min(...all, opts.zero ? 0 : Infinity, opts.ref ?? Infinity);
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
  drawMap();
  renderPlotPanel();
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
