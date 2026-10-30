# AGENTS.md — Meowho喵戶 UI prototype

Instructions for any AI coding agent (Codex, Cursor, Claude Code, Gemini, …) working in this folder.

## Before you touch any UI

Read **[DESIGN.md](./DESIGN.md)** first; §0 lists the hard rules. It is the framework: colours, type, buttons, spacing and cross-device rules. Layout, illustration and interaction are yours to invent, as long as §0 holds (see §1). If your change disagrees with DESIGN.md, follow the code in `src/app/globals.css`, then update DESIGN.md in the same change.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- Styling: CSS Modules + `src/app/globals.css` tokens. No Tailwind, no CSS-in-JS.
- 3D: three.js via React Three Fiber + drei (`src/components/journey/`)
- No backend: all data in `src/lib/` is demo data.

## Commands

```bash
npm install
npm run dev -- --port 3100   # local preview
npx tsc --noEmit             # typecheck
npm run lint                 # eslint
npm run build                # production build
```

Run typecheck and lint before you call a change done, then check the page at 375px and 1280px wide.

## Where things live

- `src/app/` — routes and `globals.css` (design tokens)
- `src/components/ui/` — `CatButton`, `Icon`, `Edges` (shared primitives; reuse them)
- `src/components/home/<section>/` — one folder per homepage section
- `src/components/journey/` — the scroll-following 3D cat 橘子 and `CatPerch`
- `src/lib/` — demo data (`cats`, `households`, `photos`) and hooks

## Non-negotiables (short version of DESIGN.md §0)

- The UI shows only what users need to read or press. No small-print notes such as data sources, "demo data" labels, stats footnotes or usage hints. Put that information in code comments for teammates instead.
- No emoji anywhere in the UI; use `<Icon>`.
- Use CSS variables, not new hex values.
- No white text on `--orange` or `--yellow`; white text goes on `--caramel` or `--ink`.
- Tap targets are at least `var(--tap)` tall; no sideways scroll at 375px.
- Every animation needs a `prefers-reduced-motion` fallback.
- Images go through `src/lib/photos.ts` (no URLs hard-coded in components) inside fixed `aspect-ratio` frames, so real photos can replace them later without layout changes. Free photos: Unsplash License only.
- Use the feature names from DESIGN.md §10 (e.g. 7 天虛擬飼養, not 虛擬試養).
