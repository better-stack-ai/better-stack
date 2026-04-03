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

## Quick start (React Router)

```bash
bash scripts/codegen/setup-react-router.sh

pnpm -F react-router dev

# Run E2E tests (builds + starts on port 3008, skips smoke.ssg.spec.ts)
pnpm -F e2e codegen:e2e:react-router
```

## Quick start (TanStack Start)

```bash
bash scripts/codegen/setup-tanstack.sh

pnpm -F tanstack dev

# Run E2E tests (builds + starts on port 3007, skips smoke.ssg.spec.ts)
pnpm -F e2e codegen:e2e:tanstack
```

---

## What each setup script does

**Next.js** (`setup-nextjs.sh`):
1. `shadcn init -t next --preset nova` — scaffolds a fresh Next.js app
2. `btst init` — runs the BTST CLI to generate all plugin files
3. `pnpm dlx shadcn add checkbox label skeleton …` — adds extra UI components
4. `patch -p1` for each `.patch` file in `scripts/codegen/patches/nextjs/` — applies E2E-specific overlays
5. Patches `package.json` (workspace deps, `start:e2e` script)
6. `pnpm install`

**React Router** (`setup-react-router.sh`):
1. `shadcn init -t react-router --preset nova` — scaffolds React Router app
2. `btst init --framework react-router` — generates all plugin files
3. `pnpm dlx shadcn add …` — adds extra UI components
4. Removes files that will be completely replaced by E2E patches (`app/root.tsx`, `app/lib/stack.ts`, `app/lib/stack-client.tsx`, `app/routes/pages/_layout.tsx`, `app/routes.ts`)
5. `patch -p1` for each `.patch` file in `scripts/codegen/patches/react-router/`
6. Patches `package.json` — starts on port 3008 via `react-router-serve`
7. `pnpm install`

**TanStack Start** (`setup-tanstack.sh`):
1. `shadcn init -t start --preset nova` — scaffolds TanStack Start app
2. `btst init --framework tanstack` — generates all plugin files
3. `pnpm dlx shadcn add …` — adds extra UI components
4. Removes files that will be completely replaced by E2E patches (`src/routes/__root.tsx`, `src/lib/stack.ts`, `src/lib/stack-client.tsx`, `src/routes/pages/route.tsx`)
5. `patch -p1` for each `.patch` file in `scripts/codegen/patches/tanstack/`
6. Patches `package.json` — starts on port 3007 via `node .output/server/index.mjs`
7. `pnpm install`

---

## Patch files

Each framework has its own `patches/<framework>/` directory. Patch filenames use `--` as a path separator.

### Next.js patches (`patches/nextjs/`)

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

### React Router patches (`patches/react-router/`)

| Patch file | What it patches |
|---|---|
| `app--root.tsx.patch` | Root layout with `PageAIContextProvider`, `Navbar`, `Toaster` |
| `app--routes.ts.patch` | Full route config including cms-example, directory, auth/public-chat API |
| `app--lib--stack.ts.patch` | Full stack with todo plugin, AI/WealthReview tools |
| `app--lib--stack-client.tsx.patch` | Full client with todo plugin, VITE_BASE_URL support |
| `app--routes--pages--_layout.tsx.patch` | Full StackProvider overrides layout |
| `app--lib--stack-auth.ts.patch` | Separate auth stack |
| `app--lib--stack-public-chat.ts.patch` | Separate public-mode chat stack |
| `app--lib--cms-schemas.ts.patch` | CMS content type definitions |
| `app--lib--mock-users.ts.patch` | Kanban user mocks |
| `app--lib--adapters-build-check.ts.patch` | Adapter re-export |
| `app--lib--query-client.ts.patch` | Shared QueryClient factory |
| `app--lib--plugins--todo--*.patch` | Full custom todo plugin (8 files) |
| `app--routes--cms-example.tsx.patch` | CMS hooks demo page |
| `app--routes--directory--*.patch` | CMS relations demo pages (3 files) |
| `app--routes--api--example-auth--$.ts.patch` | Auth stack API route |
| `app--routes--api--public-chat--$.ts.patch` | Public chat API route |
| `app--components--ui--empty.tsx.patch` | Empty-state component (used by todo) |
| `app--components--ui--field.tsx.patch` | Form field component (used by todo) |
| `app--components--ui--item.tsx.patch` | List item component (used by todo) |

### TanStack Start patches (`patches/tanstack/`)

Same logical set as React Router but with `src/` path prefix, `@/` import alias, and TanStack-specific route patterns (`createFileRoute`):

| Patch file | Key difference from React Router |
|---|---|
| `src--routes--__root.tsx.patch` | TanStack root with `createRootRouteWithContext` |
| `src--lib--stack.ts.patch` | Identical to RR but openApi title says "TanStack API" |
| `src--routes--pages--route.tsx.patch` | Uses `createFileRoute('/pages')` and router context |
| `src--routes--api--example-auth--$.ts.patch` | Uses `createFileRoute` with `server.handlers` |
| `src--routes--directory--index.tsx.patch` | Uses `createFileRoute('/directory/')` |
| `src--routes--directory--$id.tsx.patch` | Uses `createFileRoute('/directory/$id')` |
| `src--routes--directory--category--$categoryId.tsx.patch` | TanStack params pattern |
| `src--lib--plugins--todo--client--components.tsx.patch` | Uses `@/` alias (not `~/`) |
| `src--components--ui--*.patch` | Uses `@/` alias (not `~/`) |

---

## Cleanup

```bash
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/cleanup.sh react-router
bash scripts/codegen/cleanup.sh tanstack
bash scripts/codegen/cleanup.sh all    # removes all three
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
# Next.js
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/setup-nextjs.sh --baseline-only
# Edit files in codegen-projects/nextjs/
node scripts/codegen/generate-patches-nextjs.mjs

# React Router
bash scripts/codegen/cleanup.sh react-router
bash scripts/codegen/setup-react-router.sh --baseline-only
# Edit files in codegen-projects/react-router/
node scripts/codegen/generate-patches-react-router.mjs

# TanStack
bash scripts/codegen/cleanup.sh tanstack
bash scripts/codegen/setup-tanstack.sh --baseline-only
# Edit files in codegen-projects/tanstack/
node scripts/codegen/generate-patches-tanstack.mjs
```

**Single-file quick update** (after `--baseline-only`):

```bash
# Next.js
cd codegen-projects/nextjs
git diff lib/stack.ts > ../../scripts/codegen/patches/nextjs/lib--stack.ts.patch

# React Router
cd codegen-projects/react-router
git diff app/lib/stack.ts > ../../scripts/codegen/patches/react-router/app--lib--stack.ts.patch

# TanStack
cd codegen-projects/tanstack
git diff src/lib/stack.ts > ../../scripts/codegen/patches/tanstack/src--lib--stack.ts.patch
```

---

## Framework differences quick reference

| Concern | Next.js | React Router | TanStack |
|---|---|---|---|
| Port | 3006 | 3008 | 3007 |
| Root layout file | `app/layout.tsx` | `app/root.tsx` | `src/routes/__root.tsx` |
| Import alias | `@/` | `~/` | `@/` |
| API route pattern | `export const GET = handler` | `export function loader()` | `createFileRoute` + `server.handlers` |
| Pages layout | `app/pages/layout.tsx` | `app/routes/pages/_layout.tsx` | `src/routes/pages/route.tsx` |
| Route registration | File-system | `app/routes.ts` (explicit) | File-system |
| SSG support | Yes (`generateStaticParams`) | No | No |

---

## Adding a new patched file

1. Run `--baseline-only` to get a baseline for the framework
2. Add/edit the file in `codegen-projects/<framework>/`
3. Run the appropriate `generate-patches-<framework>.mjs` — it will create a new `.patch` file
4. Add the new file path to the `FILES` array in the generator script
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
