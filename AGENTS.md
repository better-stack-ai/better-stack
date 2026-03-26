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
