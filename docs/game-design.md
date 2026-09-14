# Natural — Society Simulation: Plan & Principles (v2)

**One line:** A modern-day city/economy sim where families, institutions and the bank make their
own decisions. The player is the government: owns all land and institutions, builds new ones,
answers land requests, sets taxes and policy, and is scored on real GDP per person.

**Time:** 1 tick = 1 week. 52 ticks = 1 year. Charts aggregate by month and year.

---

## 1. Core principles (the constitution)

1. **Families are the atom.** Every family wants a better lifestyle. Everything else emerges.
2. **Entities decide, the player enables.** Institutions upgrade themselves, families upgrade
   their homes, the bank decides whom to lend to. The player never clicks on an individual.
3. **Nobody takes land. Everyone requests it.** Land is the player's main lever for city planning.
4. **Money is conserved, except at the bank and the treasury.** Spending never destroys money; it
   moves it. Only bank lending creates money and only repayment destroys it (see §4).
5. **Every good has a chain.** Resource → producer → market → family. A broken link (no road, no
   power, no workers, no land) shows up as shortage, price rise, and unhappy families.
6. **Prices come from supply and demand.** Scarcity raises price. Price is the signal the
   *player* reads to decide where to build or grant land.
7. **Growth needs capital and demand.** Nothing upgrades without retained money, and most
   upgrades need a loan with a weekly EMI. That drag keeps growth slow and realistic.
8. **Progress lifts costs.** Each family level earns more and spends more. Growth must keep
   outrunning cost, or families slide back.
9. **Score = real GDP per person**, with failure states so a rich average can't hide a starving
   class (§5).
10. **Teach by showing.** Every dashboard number maps to a real idea: GDP, inflation,
    unemployment, credit, tax base, deficit.

---

## 2. Ownership and entities

| Entity | Owns | Wants | Decides on its own |
|---|---|---|---|
| **Government (player)** | All land, infra, institutions, the bank | Score | — |
| **Institution** | Its own account | Retained earnings, growth | Price, wage, hire/fire, upgrade, request land, remit surplus |
| **Family** | Savings; its home plot once bought | Higher level, happiness | Job, retraining, spending, upgrade, buy land, leave |
| **Bank** | Its reserves | Interest, low defaults | Lend or refuse, rate = base + risk |

**No private institutions.** Institutions are autonomous state enterprises with their own
accounts. Families earn wages only (plus deposit interest); they never own institutions.

### Institutions
Types: farm, dairy farm, fishery, fish market, logging camp, sawmill, mine, refinery, coal plant,
solar farm, hydro plant, nuclear plant, market (retail), school, hospital.

Per tick: produce (needs workers, inputs, power, road) → sell to market → pay wages → retain.
Rules:
- **Price:** inventory piling up → lower; sold out → raise.
- **Wage:** jobs unfilled → raise; too many applicants → hold.
- **Upgrade:** retained earnings ≥ upgrade cost AND level < cap → upgrade. Output scales with level.
- **Land:** at cap, file a land request with money attached and stop growing.
- **Surplus:** balance above a reserve (wages + next upgrade) is remitted to the treasury.

### Families
- Home levels **L1–L4 on one plot**, higher with more land. Basket (food, energy, goods, services)
  and its cost rise with level.
- **Renters:** new arrivals live in government housing at L1 and pay rent to the treasury. They
  cannot level up until they buy a plot.
- **Buying land:** savings ≥ down payment → file a land request. Player places it. Remainder is
  a mortgage with weekly EMI.
- **Job:** best-paying reachable job. Each worker has a **skill per sector**; a new sector starts
  at 30% productivity and reaches 100% over ~26 weeks, so people switch domain slowly and only
  when pushed by wages or unemployment.
- **Upgrade:** savings ≥ down payment AND income ≥ 1.3 × next basket + EMI. **Downgrade:** missed
  basket for 8 weeks. **Default:** missed EMI for 8 weeks → loan written off, level reset.
- **Happiness** = basket satisfied + employed. High → immigration (arrivals are renters with no
  savings). Low → emigration.

### Land and level cap
- Grid of plots. Every plot starts government-owned. Player sets the land price.
- **Max level = 4 × land units.** 1 plot → L1–L4, 2 plots → L8, and so on. Applies to
  institutions and homes.
- A land request = who, what for, money offered. It sits in a queue until the player picks a plot.
  Money goes to the treasury on grant.

### Market
The only place families spend. One price per good, from supply and demand. The market is an
institution: buys wholesale from producers, sells retail with a margin.

### Bank
One government-run bank. Lends to families (land, home) and institutions (expansion).
Lending capacity = deposits ÷ reserve ratio. Rate = base rate (player) + risk premium.
Too many defaults → bank stops lending → credit crunch.

---

## 3. Goods, resources and infrastructure (prototype set)

| Layer | Items |
|---|---|
| Natural resources (map) | Farmland, forest, fish, ore, coal, river/wind/sun |
| Goods | Food, wood, ore, coal, electricity, consumer goods, services |
| Player builds | Institutions, roads, rail, port, grid, water, school, hospital |
| Entities upgrade | Institution level, home level |

Building consumes **wood from the market** and pays **labour to families**, so construction is
itself part of the economy and stalls if there is no wood.

---

## 4. Money FAQ

**Does selling a natural resource create money?** No. It creates *wealth*. A caught fish is new
value; selling it moves *existing* money from buyer to seller. If nobody has money the fish rots.
That gap is why credit exists.

| Source | Creates money? | In game |
|---|---|---|
| Bank loan | Yes | Bank credits borrower. Destroyed as principal is repaid. |
| Government deficit | Yes | Treasury spends more than it taxes; balance goes negative. |
| Initial seed | Once | Starting treasury + savings. |
| Selling goods, wages, tax, rent, EMI | No | Transfers. |
| Emigration | Removes | Leaver takes savings out. |

Not in v0 but possible later: exports (money in), imports (money out), foreign investment.

**Consequences to simulate (the teaching moments)**
- More loans or deficit, same goods → **inflation**.
- Loans that fund new production → more goods → **real growth**, stable prices.
- Bank refuses to lend → no upgrades → **stagnation**.
- High tax → savings shrink → fewer upgrades. Low tax → no budget → bottlenecks.

**Invariant asserted every tick:**
`Σ all balances (treasury may be negative) = seed + Σ loans outstanding + net external flow`.

**GDP** = value of goods produced per tick at market prices. **Real GDP** = GDP ÷ price index.
**Score** = real GDP ÷ population.

---

## 5. The gameplay loop

**Simulation tick (1 week):**
1. Apply player actions (build, grant land, dials).
2. Institutions buy inputs and produce.
3. Producers sell to market; market sells to families; prices adjust.
4. Wages paid, tax and rent to treasury, EMI to bank.
5. Entities decide: upgrade, request land, hire, retrain, move, leave.
6. Bank processes loans and defaults; treasury updates.
7. Stats and score refresh.

**Player loop (every few weeks):**
- **Observe:** which good is expensive, which class is falling behind, who is unemployed?
- **Diagnose:** no land? no road? no wood for building? no power? bank tight? tax too high?
- **Act:** grant a land request, build an institution or road, move a dial.
- **Wait and see:** chain reaction over the next ~10 weeks.

The loop works if every action produces a visible chain reaction within ~10 ticks and neglect
produces a visible decline. That is the first thing the prototype must prove.

**Score:** real GDP per person, rolling yearly growth.
**Fail:** any class below the basic basket for 26 weeks; inflation above threshold for 52 weeks;
mass emigration.

---

## 6. Prototype plan

The engine is a pure library. Any UI (web, CLI, later a game engine) talks to it only through
`createWorld`, `step(state, actions)`, and read-only selectors. State is plain JSON.

| Stage | Scope | Done when |
|---|---|---|
| **v0 engine + CLI** | 20×20 grid, ~50 families, food/wood/power, farm + logging + coal plant + market + bank | 10-year runs: idle stagnates, sensible grows, bad collapses. Tests green. |
| **v0 dashboard** | Grid, charts, land-request queue with plot picker, dials, play/pause | A person can play the loop in §5 |
| **v1** | More goods and institution types, services, schools, happiness depth | — |
| **v2** | Full policy set: subsidies, bonds, reserve ratio, immigration cap, zones | — |

Tuning knobs live in one config object and are exposed in a debug panel.
