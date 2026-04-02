# Codegen Projects

This directory contains scripts that build **codegen projects** — real consumer-facing app projects created by running `shadcn init` + `btst init`, then overlaying E2E-specific content via surgical git patches.

The codegen projects live in `codegen-projects/` and are **never committed to git** (gitignored). They are always built fresh from these scripts.

---

## Why codegen projects?

They serve two purposes simultaneously:

1. **E2E confidence** — tests run against a project that was actually created by `btst init`, giving assurance that the CLI works correctly for real users.
2. **Local dev** — you can run `pnpm dev` inside a codegen project to browse all plugin pages and debug issues just like a real consumer would.

---

## Quick start (Next.js)

```bash
# From monorepo root — builds everything from scratch (~2–3 min)
bash scripts/codegen/setup-nextjs.sh

# Start the dev server
pnpm -F nextjs dev

# Run the E2E tests (starts a prod build on port 3006)
pnpm -F e2e codegen:e2e:nextjs
```

---

## What setup-nextjs.sh does

1. `shadcn init -t next --preset nova` — scaffolds a fresh Next.js app
2. `btst init` — runs the BTST CLI to generate all plugin files
3. `pnpm dlx shadcn add checkbox label skeleton …` — adds extra UI components
4. `patch -p1` for each `.patch` file in `scripts/codegen/patches/nextjs/` — applies E2E-specific overlays
5. Patches `package.json` (workspace deps, `start:e2e` script)
6. `pnpm install`

---

## Patch files

`scripts/codegen/patches/nextjs/` contains **one `.patch` file per modified file**. These patches are the source of truth for the E2E overlay — what they add on top of `btst init` output is exactly what the tests depend on.

**The patches are committed to git and should not change often.** They represent stable E2E-specific additions (custom todo plugin, separate auth stacks, CMS schemas, demo pages, etc.).

Patch filenames use `--` as a path separator:

| Patch file | What it patches |
|---|---|
| `app--layout.tsx.patch` | Adds `PageAIContextProvider`, `Navbar`, `Toaster` |
| `lib--stack.ts.patch` | Adds todo plugin, AI tools, SSG revalidation hooks |
| `lib--stack-client.tsx.patch` | Adds todo client plugin |
| `app--pages--layout.tsx.patch` | Full StackProvider overrides for E2E |
| `lib--stack-auth.ts.patch` | Separate auth stack for blog SSR tests |
| `lib--stack-public-chat.ts.patch` | Separate public-mode chat stack |
| `lib--cms-schemas.ts.patch` | CMS content type definitions |
| `lib--mock-users.ts.patch` | Kanban user mocks |
| `lib--adapters-build-check.ts.patch` | Adapter re-export for build validation |
| `lib--plugins--todo--*.patch` | Full custom todo plugin (8 files) |
| `app--cms-example--page.tsx.patch` | CMS hooks demo page |
| `app--directory--*.patch` | CMS relations demo pages (3 files) |
| `app--api--example-auth--*.patch` | Example auth API route |
| `components--ui--empty.tsx.patch` | Empty-state component (used by todo) |
| `components--ui--field.tsx.patch` | Form field component (used by todo) |
| `components--ui--item.tsx.patch` | List item component (used by todo) |
| `components--navbar.tsx.patch` | App navbar |
| `components--mode-toggle.tsx.patch` | Dark-mode toggle |

---

## Cleanup

```bash
bash scripts/codegen/cleanup.sh nextjs
```

---

## Updating a patch

When you want to change what goes into the E2E project (e.g. update a hook in `lib/stack.ts`, add a new demo page):

**Method A — Direct patch editing** (fastest for small changes)

Edit the `.patch` file directly in your editor. The unified diff format is human-readable. Unified diff format reference:
- Lines starting with `+` are added
- Lines starting with `-` are removed
- Lines with no prefix are context (must match the file being patched)

**Method B — Regeneration workflow** (safer for larger changes)

```bash
# 1. Create a fresh baseline (shadcn + btst init, committed to git)
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/setup-nextjs.sh --baseline-only

# 2. Edit files in codegen-projects/nextjs/ to the desired state
#    e.g. vim codegen-projects/nextjs/lib/stack.ts

# 3. Regenerate all patches from the delta (one .patch per changed file)
node scripts/codegen/generate-patches-nextjs.mjs

# 4. Verify patches apply cleanly, then commit the updated .patch files
```

**Single-file quick update** (after `--baseline-only`):

```bash
cd codegen-projects/nextjs
# Make your edit, then:
git diff lib/stack.ts > ../../scripts/codegen/patches/nextjs/lib--stack.ts.patch
```

---

## Adding a new patched file

1. Run `--baseline-only` to get a baseline
2. Add/edit the file in `codegen-projects/nextjs/`
3. Run `generate-patches-nextjs.mjs` — it will create a new `.patch` file automatically
4. Add the new file path to the `FILES` array in `generate-patches-nextjs.mjs`
5. Commit both the new `.patch` file and the updated generator

---

## Troubleshooting

**Patch fails to apply (`X out of Y hunks failed`)**

The shadcn or btst CLI output changed since the patch was generated. Either:
- Edit the patch manually to match the new context lines, or
- Use the `--baseline-only` + regeneration workflow above

**`btst/adapter-memory@workspace:*` error during install**

The `@btst/adapter-memory` package is published to npm, not in the monorepo workspace. Make sure `setup-nextjs.sh` is using `"^x.y.z"` for adapter packages rather than `"workspace:*"`.

**Tests have stale data (todos/posts from a previous run)**

The in-memory adapter accumulates data for the lifetime of the server process. Restart the server to get a clean state:
```bash
kill $(lsof -ti:3006)
pnpm -F nextjs run start:e2e
```
