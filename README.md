# Natural

A modern-day society and economy simulation game. Families, institutions and the bank make their
own decisions; the player governs: builds, answers land requests, and sets policy.

Design: [docs/game-design.md](docs/game-design.md) — vision, principles, entity rules, money model,
gameplay loop and the prototype plan.

## Layout

```
packages/
  engine/   @natural/engine  pure TypeScript simulation, no UI or Node dependencies
  cli/      @natural/cli     headless 10-year runs under scripted policies
  ui/       @natural/ui      web dashboard (Vite), talks to the engine only via its public API
```

The engine's contract is `createWorld(seed)`, `step(state, actions)` and read-only selectors.
State is plain JSON, so any UI (web, terminal, a game engine later) can drive it and save/load it.

## Run

```bash
npm install
npm test                # engine tests: money invariant, no negative stock, level caps, determinism
npm run sim             # CLI: idle / sensible / bad policies for 10 years (add years and seed: npm run sim -- 20 7)
npm run ui              # dashboard at http://localhost:5173
npm run typecheck
npm run check:boundary  # fails if the engine imports the UI, CLI, Node or browser globals
```

## Status (v0)

- Weekly ticks. Three goods (food, wood, power), four institution types (farm, logging camp,
  coal plant, market), one bank, one treasury, land requests, level cap of 4 per plot.
- Everyone without an institution job works a public job at a wage the player sets.
- The exit criterion of the plan holds on seed 1: the idle policy stagnates without failing, the
  sensible policy roughly doubles real GDP per person and lifts homes to level ~1.8, the bad policy
  collapses by exodus.
- Known rough edges: a large share of workers sit in public jobs at the start (the three-good
  economy has few jobs until demand grows); growth flattens around home level 2 without more
  goods and services; tuning knobs all live in `packages/engine/src/config.ts`.
