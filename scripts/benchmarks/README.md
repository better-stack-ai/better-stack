# Matched rendering benchmark

This benchmark compares the published BTST 5.2.0 package with packed candidate
packages in two independent Next.js 16.4.5 production applications. It generates
the applications from the same source templates, changing only the public plugin
import paths. Both applications use React 19.3.1, identical direct third-party
dependencies, fixture data, viewport, CSS configuration and authorization rules.

The four separately split routes exercise a Core provider/custom-plugin shell,
the native Blog `PostPage`, Blog `NewPostPage`, and a dashboard composed from Blog,
CMS and Kanban APIs. The dashboard uses a real `PostCard`, content-type hook and
board-list hook. Its board summary has application-owned markup, not a Kanban
task editor. No AI, cloud or payment services are used.

React Query receives the same fixed serialized data before server rendering,
representing a prefetched application. A real local HTTP route handles follow-up
requests. Each page is dynamically server-rendered; these are production builds,
not development servers or a static HTML proxy. The harness requires expected
route content in each server response before sampling.

## Run

Use Node 22 and the repository's pinned pnpm. Choose an output directory outside
the checkout with enough space for two dependency trees and production builds.

```sh
node scripts/benchmarks/prepare-rendering.mjs --artifacts <candidate-tarball-directory> --output <application-directory>
pnpm --dir <application-directory>/v5 install --strict-peer-dependencies --frozen-lockfile=false
pnpm --dir <application-directory>/v6 install --strict-peer-dependencies --frozen-lockfile=false
pnpm --dir <application-directory>/v5 build
pnpm --dir <application-directory>/v6 build
node scripts/benchmarks/run-rendering.mjs --apps <application-directory> --output <results-directory> --runs 15
node scripts/benchmarks/summarize-rendering.mjs <results-directory>
```

The runner owns ports 3210 and 3211. Stop its servers before another run. Serialize
builds and keep other CPU-heavy work idle during performance sampling. Candidate
archives must include Core, Blog, CMS and Kanban. The baseline is downloaded by
immutable version and verified against its npm SHA512 integrity and source commit.

The default lab profile uses a 1280×800 viewport, Chromium CPU slowdown of 4,
150 ms network latency, 1.6 Mbit/s download and 750 Kbit/s upload. `--unthrottled`
removes CPU/network emulation. No request interception disables browser caching.

Each route receives one excluded, traced warm-up and 15 measured paired cold and
warm navigations. Variant order alternates by repetition, and route order rotates.
Cold means a fresh browser context; warm means a repeated full navigation in the
same context. Servers and modules are warmed first. Resource Timing transfer
sizes provide evidence of cache use. Client navigation is measured separately
from the Core route using a Next link with prefetch disabled.

## Interpretation

FCP, LCP, CLS and browser TTFB come from browser performance entries. LCP records
the actual element and text so the result can be checked against the selected
plugin content. Content visibility is sampled on animation frames. The shell's
hydration effect is separate from route readiness; editor readiness requires the
real Milkdown contenteditable control. Counter interaction measures a trusted
click through its DOM commit and next animation frame; it is a lab measurement,
not field INP. Navigation readiness is also an application-specific lab metric.

`samples.jsonl` is an incremental raw log; `samples.json` and `metadata.json` retain
the full observations and environment. `summary.json` and `report.md` contain
medians, p10/p90 spreads, paired median changes and deterministic paired-bootstrap
95% intervals. Those intervals describe repetition on this host, not variation
between users or devices. Failed observations stop the run and cannot be silently
excluded from a success claim.

`asset-sizes.json` records raw and gzip sizes of observed JavaScript/CSS assets.
Entries overlap across routes and must not be summed into an application total.
Screenshots and Playwright traces cover the excluded warm-up, avoiding tracing
overhead in measured repetitions. Capture source revisions, artifact integrity,
dependency lockfiles and build logs alongside results before making release
performance claims. A package-download reduction does not establish a rendering
speedup; report slower and inconclusive results as such.
