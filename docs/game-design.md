# Natural — Society Simulation: Plan & Principles

**One line:** A modern-day city/economy sim where families, businesses and banks make their own
decisions. The player is the government: builds infrastructure, sets taxes and policy, and wins by
raising income for *every* class of citizen.

---

## 1. Core principles (the constitution)

1. **Families are the atom.** Every family wants one thing: a better lifestyle. Everything else emerges.
2. **Entities decide, the player enables.** Families, businesses and banks act on simple local rules.
   The player never upgrades a house or a shop. The player only creates conditions: land, roads,
   power, water, schools, tax, subsidies, interest rate.
3. **Money is conserved, except at banks and government.** Spending never destroys money; it moves
   it. Only bank lending creates money and only loan repayment destroys it (see §4).
4. **Every good has a chain.** Resource → producer → transport → market → family. A broken link
   (no road, no power, no workers) shows up as shortage, price rise, and unhappy families.
5. **Prices come from supply and demand.** No fixed prices. Scarcity raises price, which attracts
   new producers, which lowers price. This is the main self-balancing force.
6. **Growth needs capital and demand.** A business expands only when it is profitable *and* can get
   money (savings or loan). A family upgrades only when it can afford the new spend level.
7. **Progress lifts costs.** Each family level earns more and spends more. Growth must keep outrunning
   cost, or families slide back. This is the tension that makes it a game.
8. **The player is judged on the whole distribution, not the average.** Score = income growth of the
   poorest class, the middle, and the top, plus per-person income. A rich city with a poor class fails.
9. **No micromanagement.** If a mechanic needs the player to click on an individual family or shop, it
   is the wrong mechanic.
10. **Teach by showing.** Every number the player sees should map to a real economic idea
    (GDP, inflation, unemployment, credit, tax base, budget deficit).

---

## 2. Entities and their decision rules

| Entity | Wants | Decides on its own | Player influence |
|---|---|---|---|
| **Family** | Higher lifestyle level, happiness | Where to work, what to buy, when to upgrade home, when to borrow, when to start a business | Taxes, schools, housing zones, transport |
| **Business** | Profit | Hire/fire, raise/lower price, expand, borrow, close | Zones, roads, power, corporate tax, subsidies |
| **Bank** | Interest income, low defaults | Lend or refuse, set rate = base rate + risk | Base interest rate, reserve ratio |
| **Government (player)** | Score | — | Build infra, set taxes, subsidies, borrow, set base rate |

### Family
- Levels **L1–L5** (e.g. Basic → Modest → Comfortable → Affluent → Wealthy).
- Each level has a **needs basket** (food, housing, energy, goods, services, transport) and a **cost**.
- Income = wages from jobs (one or two workers per family) + business profit if they own one.
- **Upgrade rule:** savings ≥ down-payment for next level AND expected income ≥ 1.3 × next level cost.
  Remainder is a bank mortgage. **Downgrade rule:** missed basket for N ticks, or default.
- **Job rule:** takes the best-paying reachable job (reachable = transport time under a limit).
- **Entrepreneur rule:** if a good is in shortage nearby and the family has savings, it may open a
  business (probability scales with education level).
- **Happiness** = basket satisfied + commute short + services nearby. Low happiness → emigrate.
  High happiness → immigration (new families arrive). This is population growth.

### Business
- Types by sector: **primary** (farm, fishing, logging, mining, coal), **secondary** (mill, factory,
  power plant, food processing), **tertiary** (shop, clinic, school, transport, bank).
- Needs: land with the resource (primary), inputs (secondary), workers, power, road access.
- Each tick: produce → sell at market price → pay wages, inputs, tax → keep profit.
- **Expand rule:** profit margin > X for N ticks and workers available → add capacity (self-funded or
  loan). **Shrink/close rule:** losses for N ticks.
- **Price rule:** inventory piling up → lower price; sold out → raise price.
- **Wage rule:** cannot fill jobs → raise wage; too many applicants → hold wage.

### Bank
- Holds family and business deposits.
- **Lends by creating a deposit** (money creation). Loan limit = reserve ratio × deposits.
- Interest = base rate (player) + risk premium (borrower's income vs. loan size).
- Default → bank loses, borrower downgrades. Too many defaults → bank stops lending → credit crunch.

### Government (player)
- **Income:** income tax, corporate tax, sales tax, land sale, government bonds (borrow from banks).
- **Spend:** infrastructure (roads, rail, port, power plants, water, schools, hospitals), subsidies,
  interest on debt, maintenance.
- **Policy dials:** tax rates, base interest rate, reserve ratio, subsidy per sector, immigration cap.

---

## 3. Goods, resources and infrastructure (prototype set)

| Layer | Items |
|---|---|
| Natural resources (map tiles) | Farmland, forest, fish, ore, coal, river/wind/sun (for power) |
| Goods | Food, wood, ore, coal, electricity, consumer goods, services |
| Infrastructure (player builds) | Road, rail, port, power plant (coal / solar / hydro / nuclear), grid line, water, school, hospital, residential/commercial/industrial zone |
| Upgrades (entities do) | House level, business capacity, machinery (raises output per worker) |

Infrastructure only enables; it earns nothing directly. A road makes jobs reachable and goods flow.
A school raises education → higher productivity and more entrepreneurs. Power is a required input
for secondary/tertiary businesses and for L3+ homes.

---

## 4. Where money comes from and where it goes

This is the part most games fake. Keep it honest and simple:

**Money is created when**
1. A **bank issues a loan** — it credits the borrower's account with new money. This is the main
   source, exactly as in the real world.
2. The **government spends more than it taxes** (deficit) and finances it with bonds bought by banks.

**Money is destroyed when**
1. A **loan principal is repaid** (interest stays as bank income and keeps circulating).
2. The government **runs a surplus and retires debt**.

**Money only moves (never disappears) when**
- A family buys food → money goes to the shop → to the farmer → to their workers → back to shops.
- Taxes are paid → money goes to the treasury → spent on infrastructure → to construction workers.
- Wages, rent, interest, subsidies.

**Real value is created when** goods are produced (a fish caught, power generated). **Real value is
consumed when** families eat, use power, wear out goods. Consumption removes the *good*, not the
money. So the player's assumption "food eaten = money gone" should be: food eaten = good gone,
money now sits with the food seller.

**Consequences to simulate (these are the teaching moments)**
- More loans → more money chasing same goods → **inflation** if production doesn't grow.
- Loans funding new production → more goods → **real growth**, stable prices.
- Bank refuses to lend → businesses can't expand → **stagnation**, unemployment.
- High tax → treasury grows but families' savings shrink → fewer upgrades, fewer businesses.
- Low tax → no infrastructure budget → bottlenecks (no roads, no power) → growth stalls.

**GDP** (shown to player) = total value of goods and services produced per tick.
**Per-person income** = total wages + profits ÷ population.

---

## 5. The gameplay loop

**Simulation tick (e.g. 1 tick = 1 month):**
1. Businesses produce, using resources, inputs, workers, power.
2. Markets clear: prices adjust, goods move along transport to buyers.
3. Families earn, pay tax, buy basket, save the rest.
4. Families and businesses run their decision rules (upgrade, borrow, hire, open, close, move).
5. Banks process loans, interest, defaults.
6. Treasury updates; player budget available.
7. Stats and score refresh.

**Player loop (every few ticks):**
- **Observe:** Which class is falling behind? What is in shortage? Where is unemployment?
- **Diagnose:** Missing road? No power? No workers (housing)? No capital (bank tight)? Tax too high?
- **Act:** Build infrastructure, zone land, adjust a dial.
- **Wait and see:** Entities respond over the next ticks. Score moves.

The loop works if every player action produces a *visible* chain reaction within ~10 ticks, and if
neglect produces a visible decline. That is the first thing the prototype must prove.

**Win/score:** Rolling 5-year growth of income for each of 3 classes (bottom / middle / top), per-person
income, and no class below the basic basket. Failure states: bankrupt treasury, mass emigration,
runaway inflation.

---

## 6. Prototype plan (v0 → v2)

Goal of v0 is **not graphics**. It is to see whether the numbers produce a loop.

### v0 — Headless economy (1–2 weeks)
- Tick engine, ~50 families, 3 goods (food, wood, power), 2 sectors, 1 bank, 1 treasury.
- Rules from §2 as plain functions. Prices via simple supply/demand.
- Web dashboard: tables + line charts (GDP, money supply, prices, class incomes, treasury).
- Player actions: build road (unlocks a resource tile), build power plant, set income tax %,
  set base interest rate.
- **Exit criterion:** running 200 ticks with *no* player input stagnates; with sensible inputs it
  grows; with bad inputs it collapses. If all three don't happen, tune rules before adding anything.

### v1 — Space (2–3 weeks)
- Small tile grid; distance matters for jobs and goods.
- Zones, roads, rail, multiple resource types, family levels visible as house tiles.
- Business self-expansion visible.

### v2 — Full policy set
- All taxes, subsidies, bonds, reserve ratio, immigration, education, happiness, multiple banks.

**Tech (proposed):** TypeScript, simulation as a pure library (no rendering dependency), Vitest
tests for economic invariants (money conservation, no negative stock), Vite + a lightweight UI for
the dashboard. Rendering engine decision deferred to v1.

---

## 7. Tuning knobs and invariants to test

- **Invariant:** Σ money across all accounts = Σ loans outstanding + government deficit. Assert every tick.
- **Invariant:** no good is consumed that was not produced or imported.
- **Knobs to expose in a debug panel:** upgrade threshold multiplier, price elasticity, wage
  stickiness, reserve ratio, loan risk premium, basket cost per level.

---

## 8. Open questions (decide during v0)

1. Is there an "outside world" (imports/exports) or is the economy closed? Closed is simpler for v0.
2. Does the player set interest rates (central bank) or only banks? Proposal: player sets base rate.
3. How much land does the player give away vs. sell? Selling land is a treasury income source.
4. Tick length: month is a good balance of speed and readability.
5. How many classes to track: 3 (bottom/middle/top thirds) is enough to teach inequality.
