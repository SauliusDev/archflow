# Contributing to Flowforge

## Dev Setup

```bash
git clone https://github.com/SauliusDev/flowforge.git
cd flowforge
pnpm install
pnpm dev        # http://localhost:3000
```

**Package manager:** always use `pnpm`. Never `npm install` or `yarn`.

## Making Changes

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes — see Architecture Rules below
3. Run `pnpm lint` and `pnpm build` before pushing
4. Open a PR against `master`

## Architecture Rules

- **The `.mmd` file is the single source of truth.** Mermaid syntax is derived via `serialize()` in `lib/serializer.ts`, and visual layout state is embedded in an `FLOWFORGE LAYOUT` Mermaid comment block via `lib/embeddedLayout.ts`.
- **Never mutate store state directly.** Use store actions (`addNode`, `updateNodeShape`, etc.) in `lib/store.ts`.
- **Always call `pushHistory()` before any mutation** — required for undo/redo to work.
- **Edge type is always `flowEdge`** (not `default`). Node type is always `flowNode`.
- **Mermaid security level is `strict`** — do not change this; it prevents XSS from diagram content.
- Keep UI concerns in `components/` and pure diagram logic in `lib/`.

See `AGENTS.md` for the full architecture reference.

## PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Open an issue first for large changes
- Update `CHANGELOG.md` under `[Unreleased]` with what you added/changed/fixed
- Run `pnpm build` locally and confirm it passes before opening the PR

## Versioning

| Change type | Version bump |
|-------------|-------------|
| Bug fix | `patch` (0.1.0 → 0.1.1) |
| New feature, backwards-compatible | `minor` (0.1.0 → 0.2.0) |
| Breaking change | `major` (0.1.0 → 1.0.0) |
