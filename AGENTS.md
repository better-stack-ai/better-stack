---
description: "Rules for AI agents working with the BTST monorepo - plugin development, build configuration, and testing"
alwaysApply: true
---

# BTST Monorepo - Agent Rules

## Environment Setup

### Node.js Version
Always use Node.js v22 before running any commands:
```bash
source ~/.nvm/nvm.sh && nvm use 22
```

### Build Commands
```bash
pnpm build          # Build all packages
pnpm typecheck      # Type check all packages
pnpm lint           # Lint all packages
```

## Agent Skills

Detailed patterns and reference material are in the following skills. Read the relevant skill before working in that domain.

| Skill | Domain | Trigger |
|---|---|---|
| [`btst-backend-plugin-dev`](.agents/skills/btst-backend-plugin-dev/SKILL.md) | Backend plugin authoring | `defineBackendPlugin`, `getters.ts`, `mutations.ts`, lifecycle hooks, api factory |
| [`btst-client-plugin-dev`](.agents/skills/btst-client-plugin-dev/SKILL.md) | Client plugin authoring | `defineClientPlugin`, routes, SSR loaders, meta, `ComposedRoute`, `useSuspenseQuery` |
| [`btst-plugin-ssg`](.agents/skills/btst-plugin-ssg/SKILL.md) | SSG support | `prefetchForRoute`, `query-key-defs.ts`, serializers, `next build` silent failures |
| [`btst-build-config`](.agents/skills/btst-build-config/SKILL.md) | Build & exports | New entry points, `build.config.ts`, `exports`/`typesVersions`, example app updates |
| [`btst-testing`](.agents/skills/btst-testing/SKILL.md) | E2E testing | Playwright smoke tests, per-framework runs, API key guards |
| [`btst-docs`](.agents/skills/btst-docs/SKILL.md) | Documentation | FumaDocs, `AutoTypeTable`, when to update plugin MDX files |
| [`btst-registry`](.agents/skills/btst-registry/SKILL.md) | Shadcn registry | `build-registry.ts`, `EXTERNAL_REGISTRY_COMPONENTS`, adding a plugin |
| [`btst-ai-context`](.agents/skills/btst-ai-context/SKILL.md) | AI chat page context | `useRegisterPageAIContext`, `clientTools`, `BUILT_IN_PAGE_TOOL_SCHEMAS` |
| [`btst-integration`](.agents/skills/btst-integration/SKILL.md) | Consumer integration | Integrating `@btst/stack` into an external app (not monorepo work) |

## Cursor Cloud specific instructions

### Quick reference
- **Package manager:** pnpm 10.17.1 (declared in root `package.json` `packageManager` field)
- **Node.js:** v22.18.0 (`.nvmrc`)
- **Build orchestration:** Turborepo (`turbo.json`)
- **Linter:** Biome (`biome check .`)
- **Test runner:** Vitest (unit), Playwright (E2E)
- **No external services required** — the library uses `@btst/adapter-memory` for testing; no Docker/DB needed.

### Corepack prompt
When running pnpm in subdirectories (e.g. `docs/`, `playground/`), corepack may prompt to download pnpm. Set `COREPACK_ENABLE_AUTO_PIN=0` in your shell to suppress the interactive prompt, or answer `Y` when prompted.

### Build before test
Turborepo's `test` task depends on `build` (see `turbo.json`). Always run `pnpm build` before `pnpm test` if you haven't built yet in the session.

### Docs site
Run `cd docs && pnpm dev` to start the FumaDocs site at `http://localhost:3000/docs`. The root route (`/`) returns 404; use `/docs` as the entry point.

### Playground
The playground (`cd playground && pnpm dev`, port 3002) requires an `OPENAI_API_KEY` in `playground/.env.local`. Without it, the AI chat plugin won't function but other plugins still work.

### E2E / codegen projects
Codegen projects are generated on-the-fly (not committed). Run `bash scripts/codegen/setup-nextjs.sh` to create the Next.js test project, then `pnpm -F e2e codegen:e2e:nextjs` for E2E tests. See `scripts/codegen/README.md` and `CONTRIBUTING.md` for full details.
