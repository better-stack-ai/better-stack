# BTST public message and claims contract

This document is the source of truth for public-facing BTST copy. Use it for
the GitHub storefront, documentation introductions, marketing pages, plugin
catalogs, and social metadata. Technical reference pages remain the source of
truth for exact APIs, package versions, and integration steps.

## Naming

**BTST** is the standalone public product name. Do not expand it to “Better
Stack” on first mention or later mentions, and do not invent another expansion
or abbreviation.

| Identifier | Public-copy rule |
| --- | --- |
| BTST | Product name in headings, prose, navigation, diagrams, and image labels. |
| `@btst/*` | npm package scope. Use only when identifying a package or showing an install/import command. |
| `better-stack-ai` | Existing GitHub organization identifier. Use it in repository URLs, not as another product name. |
| `better-stack-ai/better-stack` | Existing repository identifier. Keep it in GitHub links and clone commands. |
| `https://www.better-stack.ai` | Current canonical website origin. Use it for marketing, documentation, demo, and playground URLs. |
| Better Stack AI | Use only when an existing organization or legal identifier requires the words. It is not an alternate product name. |

Package, repository, organization, and domain identifiers are infrastructure,
not naming variants. Changing any of them is migration work outside this
contract.

## Message spine

Use the following ideas in this order, shortened to fit the surface.

### Headline

> Add complete features to the React app you already own.

### Category

> BTST is an open-source TypeScript system for installing full-stack features
> into existing React applications.

Plugins are the delivery mechanism, not the category a new reader must already
understand.

### Audience and job

The primary reader is a React/TypeScript developer or small product team with
an existing application. They need to add a substantial recurring feature
without replacing their app with a starter or handing the feature to a hosted
platform. Agencies, startups, and AI-product teams are secondary audiences.

### Concrete payload

A **full-stack** plugin can bring the routes, APIs, database schema, hooks,
SSR-aware pages, and customizable UI that its feature needs. Describe the
actual payload on each plugin page; do not imply that one-sided or companion
plugins include every layer.

### Adoption model

Start with one plugin inside the application the developer already has. Add
more only when they are useful. Describe the category wedge as:

> More complete than a UI kit, more incremental than a starter application,
> and more ownable than a hosted feature service.

Compare categories without attacking or naming competitors.

### Ownership

Lead with the strong claim:

> You own the whole application.

Always substantiate it nearby: the application, data, deployment, and ejected
UI stay under the developer's control. BTST runs inside their stack as an
open-source dependency they can inspect, fork, or replace, never as a required
hosted control plane.

Prefer “runs inside your application, with your database and deployment” to
“self-hosted.” The latter may appear in supporting or search copy only when the
surrounding sentence explains what is hosted.

## Plugin taxonomy

Classify a released plugin by its topology and, when relevant, its relationship
to another system. Topology and relationship are separate dimensions.

| Label | Meaning |
| --- | --- |
| **Full-stack** | Registers both backend and client behavior. State the concrete routes, APIs, data model, pages, hooks, or UI it actually includes. |
| **Backend-only** | Registers server behavior without BTST client pages or UI. |
| **Client-only** | Registers client routes, pages, or UI without its own BTST backend. |
| **Companion** | A separately maintained capability that connects BTST to an existing external system. State what that system must already provide. |
| **Dependent** | Requires another BTST plugin. Name the dependency and whether setup adds it automatically. |

Use a compact topology label followed by a plain-language payload. Examples:

- **Full-stack** — routes, APIs, data model, pages, and UI
- **Backend-only** — generated OpenAPI endpoint and interactive API reference
- **Client-only** — generated route reference UI
- **Client-only · requires CMS** — visual page-building interface
- **Companion · requires Better Auth** — auth and account UI for an existing
  Better Auth backend

Public catalogs contain only installable, released plugins. Do not mix roadmap
ideas into the available inventory.

## Release status

- **Stable** means the plugin is part of a stable release and has maintained
  test coverage, current documentation, and an explicit support commitment.
- **Preview** means the plugin is installable but lacks part of the evidence or
  support commitment required for Stable.

Classify from release and test evidence. Never apply “production-ready” to all
plugins by default.

## Claim ledger

### Claims that may ship

These claims are supported when used with the scope shown here:

- BTST is an open-source TypeScript system installed into an existing React
  application.
- Full-stack plugins can provide routes, APIs, database schema, hooks,
  SSR-aware pages, and customizable UI. Use “can” or name the individual
  plugin; one-sided plugins have a smaller payload.
- Developers can start with one plugin and keep their existing application,
  data, and deployment.
- BTST has no required hosted control plane.
- View code installed from the registry is copied into the application and can
  be edited there; runtime and data behavior remains an upgradeable package
  dependency unless the developer forks or replaces it.
- BTST is MIT licensed and its source is public.
- The v3 integration paths are maintained and tested for Next.js App Router,
  React Router v7, and TanStack Start. Use the compatibility documentation for
  exact versions and qualifications.

### Claims that require evidence or qualification

- **Production-ready** — identify the specific Stable plugin and the release,
  tests, documentation, and support policy that justify it.
- **Framework or database support** — distinguish maintained and continuously
  tested integrations, available but not continuously tested integrations, and
  custom-adapter possibilities. Prefer “framework-flexible.”
- **Works with** — define the integration boundary and link to current setup or
  compatibility evidence.
- **Installation time** — provide a measured scenario, prerequisites, start and
  finish conditions, and methodology.
- **Productivity, cost, or savings** — provide measured evidence and published
  methodology or an attributable case study.
- **Adoption, customer, download, or GitHub metrics** — source live data;
  customer names and testimonials require approval.
- **Self-hosted** — immediately explain that BTST runs inside the developer's
  application, database, and deployment.

### Claims to avoid

- Blanket “production-ready” language
- Universal “framework-agnostic” or unqualified “database-flexible” language
- “Zero boilerplate,” “zero config,” or “zero learning curve”
- Universal installation-time promises
- “10x engineer,” 740–1080 hours saved, roughly $108k saved, or “a seed round”
  comparisons without measured evidence and methodology
- Generic “no lock-in” claims when the concrete ownership explanation is
  available
- Unverified roadmap items presented as available features

Trust should lead with a working demo, public source, the MIT license, stable
releases, and current test/support evidence. Stars and downloads are secondary.

## Calls to action

Match the first action to the reader's intent while keeping all three levels
available:

| Surface | Primary | Secondary | Detailed path |
| --- | --- | --- | --- |
| Marketing homepage | See a live BTST feature | Add BTST to an app | Documentation |
| GitHub README | Quickstart with Blog | View live result | Manual documentation |
| Documentation landing | Install the first feature | Understand how BTST works | Manual integration reference |
| Plugin catalog | Explore released plugins | — | Plugin detail page |
| Plugin detail | View the demo, when one exists | Install or read the setup guide | API/reference material |

Use Blog as the canonical first feature because it demonstrates the complete
vertical slice. A successful quickstart ends at a visible Blog route. Explain
the human installation path before offering the AI-agent skill as an
accelerator.

## Voice and review

Write with a confident, specific, and lightly opinionated voice. Prefer actual
payloads and boundaries to generic adjectives. Avoid profanity, manufactured
outrage, competitor attacks, and hype.

Before publishing a first screen, ask whether a new React developer can answer:

1. What is BTST?
2. Is it for an application like mine?
3. What does the plugin install?
4. Can I add one feature without replacing my app?
5. What do I continue to own and operate?
6. Which proof can I see, and what should I do next?
