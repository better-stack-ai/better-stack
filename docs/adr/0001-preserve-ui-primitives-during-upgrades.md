# Preserve UI primitives during framework upgrades

BTST's shared UI and generated application fixtures use Radix, while the playground uses Base UI. Keep those choices during framework and shadcn upgrades, reviewing upstream component changes while preserving existing APIs, behavior, and local customizations. Moving the shared components to Base UI would require a separate migration of component APIs and composition; [shadcn continues to support Radix](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default).
