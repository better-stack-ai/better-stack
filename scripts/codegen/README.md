# Codegen Projects

This directory contains scripts that build **codegen projects** — real consumer-facing app projects created by running `shadcn init` + `btst init`, then overlaying E2E-specific files.

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
4. **Copies** every file from `scripts/codegen/files/nextjs/` into the project (overwrites)
5. Patches `package.json` (workspace deps, `start:e2e` script)
6. `pnpm install`

**React Router** (`setup-react-router.sh`):
1. `shadcn init -t react-router --preset nova` — scaffolds React Router app
2. `btst init --framework react-router` — generates all plugin files
3. `pnpm dlx shadcn add …` — adds extra UI components
4. **Copies** every file from `scripts/codegen/files/react-router/` into the project (overwrites)
5. Patches `package.json` — starts on port 3008 via `react-router-serve`
6. `pnpm install`

**TanStack Start** (`setup-tanstack.sh`):
1. `shadcn init -t start --preset nova` — scaffolds TanStack Start app
2. `btst init --framework tanstack` — generates all plugin files
3. `pnpm dlx shadcn add …` — adds extra UI components
4. **Copies** every file from `scripts/codegen/files/tanstack/` into the project (overwrites)
5. Patches `package.json` — starts on port 3007 via `node .output/server/index.mjs`
6. `pnpm install`

---

## E2E overlay files

The `files/<framework>/` directories contain the **complete desired file content** for every file that needs to differ from the raw `btst init` output. These are plain source files — edit them in your IDE like any other file.

```
scripts/codegen/files/
  tanstack/
    src/lib/stack.ts          ← full E2E stack config
    src/lib/stack-client.tsx  ← full E2E client config
    src/router.tsx
    src/routes/__root.tsx
    src/routes/pages/route.tsx
    src/routes/pages/$.tsx
    src/lib/plugins/todo/...  ← complete todo plugin
    ...
  react-router/
    app/lib/stack.ts
    app/root.tsx
    app/routes.ts
    ...
  nextjs/
    lib/stack.ts
    app/layout.tsx
    app/pages/layout.tsx
    ...
```

These files are **the source of truth**. The `codegen-projects/` are ephemeral — they are always rebuilt from these files.

---

## Updating E2E overlay files

### Method A — Edit directly (fastest)

Open any file in `scripts/codegen/files/<framework>/` and edit it. Next time a codegen project is rebuilt from scratch, it will pick up your changes automatically.

### Method B — Edit in the live codegen project, then sync back

Sometimes it's easier to iterate in the running dev server, then persist your changes:

```bash
# Edit files in codegen-projects/tanstack/...
# Then sync them back:
bash scripts/codegen/update-files-tanstack.sh
bash scripts/codegen/update-files-react-router.sh
bash scripts/codegen/update-files-nextjs.sh
```

These scripts copy the relevant files from the codegen project back into `scripts/codegen/files/<framework>/`. Commit the result.

### Adding a new overlay file

1. Create the file in `scripts/codegen/files/<framework>/` at the correct path
2. Add the file path to the `FILES=(...)` array in the corresponding `update-files-<framework>.sh`
3. Rebuild the codegen project to verify: `bash scripts/codegen/cleanup.sh <fw> && bash scripts/codegen/setup-<fw>.sh`

---

## Cleanup

```bash
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/cleanup.sh react-router
bash scripts/codegen/cleanup.sh tanstack
bash scripts/codegen/cleanup.sh all    # removes all three
```

---

## Troubleshooting

**E2E file not taking effect**

Make sure you edited the file in `scripts/codegen/files/<framework>/`, not in `codegen-projects/` (which is ephemeral). Rebuild to verify:

```bash
bash scripts/codegen/cleanup.sh tanstack && bash scripts/codegen/setup-tanstack.sh
```

**Tests have stale data (todos/posts from a previous run)**

The in-memory adapter accumulates data for the lifetime of the server process. Restart the server to get a clean state:

```bash
kill $(lsof -ti:3006)
pnpm -F nextjs run start:e2e
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
