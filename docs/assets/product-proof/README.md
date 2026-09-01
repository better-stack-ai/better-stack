# BTST product-proof asset kit

This kit pairs short, causal claims with real screens from the repository's generated Next.js application. The only conceptual asset is the editable ownership diagram. No mock product UI or model output is fabricated.

## Visual contract

- Preserve the graphite BTST symbol and use the `BTST` name consistently.
- Use graphite, paper, fog, and restrained cobalt; product screenshots retain their real UI colors.
- Set presentation copy in Geist Sans and labels in Geist Mono when available.
- Keep reusable proof frames at 16:9. A narrow claim rail explains what the screenshot proves; the larger area remains authentic product evidence.
- Annotate only a causal connection or visible outcome. Do not add invented metrics, version badges, customer logos, or testimonial claims.

Product UI is captured deterministically in its dark theme. The raster proof frames are self-contained and do not change with the host color scheme; the ownership SVG intentionally uses a fixed light canvas. Whenever an asset or its frame changes, verify the README and docs embedding in both host themes so borders, captions, and surrounding contrast remain clear.

## Capture recipe

The committed outputs are deterministic captures of a freshly generated app. The recipe uses Node 22, the repository-pinned `pnpm@10.17.1`, Playwright Chromium, a 1440×900 viewport at DPR 1, UTC, `en-US`, dark theme, and reduced motion. Sharp frames each raw screenshot as a 1600×900 WebP.

The coherent fixture is [dogfood-data.json](../../../e2e/product-proof/dogfood-data.json). It contains no personal data and describes one release-evidence story across Blog, Comments, Form Builder, UI Builder, Media, OpenAPI, Route Docs, and AI Chat. The capture workflow seeds Blog posts, an approved Comment, a published UI Builder page, and one exact-name Media asset through the registered plugin's direct multipart upload route. It removes that Media asset before and after every run, verifies the stored record, filters the generated library route, and requires exactly one visible asset card. Form Builder remains an unsaved interaction; OpenAPI and Route Docs are generated from the registered backend and client stacks. AI Chat requires both an empty authenticated-history API result and the visible empty-sidebar state before it types—but does not send—the fixture prompt.

```bash
# From the repository root, with Node 22 active
corepack pnpm install --frozen-lockfile
corepack pnpm --filter e2e exec playwright install chromium
corepack pnpm build
SHADCN_VERSION=4.19.1 bash scripts/codegen/setup-nextjs.sh

# In one terminal
PRODUCT_PROOF_BASE_URL=http://localhost:3006 \
  corepack pnpm -F nextjs exec next dev -p 3006

# In another terminal
PRODUCT_PROOF_BASE_URL=http://localhost:3006 \
  corepack pnpm --filter e2e exec node product-proof/capture.mjs

node scripts/product-proof/check-assets.mjs \
  docs/assets/product-proof/manifest.json
bash scripts/codegen/cleanup.sh nextjs
```

The setup script defaults `SHADCN_VERSION` to `4.19.1`; change it only as an intentional toolchain update followed by a full recapture. The capture script removes and recreates only its known Blog, Comments, UI Builder, and Media fixtures, waits for fonts and network idle, disables motion and dev overlays, rejects stale naming or personal fixture text, captures the real routes, and writes static outputs. Run it twice from a fresh generated app and compare SHA-256 hashes when changing the workflow itself.

Deliverable filenames are stable public references: keep a filename when refreshing the same proof, and rename it only when the evidence meaning changes, updating the manifest and every consumer atomically. `manifest.version` is the manifest/checker schema revision. Increment `manifest.assetRevision` whenever capture copy, source data, layout, or output pixels change.

## Aperture and truth boundaries

| Asset | Real state captured | Claim boundary |
| --- | --- | --- |
| README hero | Focused Blog route | Category promise plus one authentic, legible product result |
| Blog | Published Blog route | Canonical full-stack slice |
| Form Builder | Unsaved editor with three fields and live preview | Rich interactive UI; no submission claim |
| UI Builder | Persisted published page in editor | CMS-backed page composition |
| OpenAPI | Live Scalar reference route | Backend-only plugin with generated reference UI |
| AI Chat | Authenticated empty shell with typed prompt | No model response or tool result claimed |
| Code → result | Current Blog backend and client registrations plus published route | Causal registration-to-outcome pattern |

The code excerpt is derived from the generated app's current [backend registration](../../../scripts/codegen/files/nextjs/lib/stack.ts) and [client registration](../../../scripts/codegen/files/nextjs/lib/stack-client.tsx). Capture fails with a source-specific drift error if either critical registration changes. It documents the registrations in the captured all-plugin dogfood app; no separate scaffold is implied.

Every representative frame fits the entire 1440×900 product screen into a 16:9 aperture with `contain`; navigation, sidebar, and controls remain present rather than being cover-cropped. The README hero uses one intentional, full-width close crop of the real Blog route so its essential promise and proof remain legible at a roughly 358 px GitHub mobile width. Matte space may be added around a representative screen, but no claimed workflow or explanatory copy may be clipped. Rails and README copy must be completely visible at 1600×900 and remain readable at repository width.

## Budgets and accessibility

`manifest.json` is the source of truth for dimensions, individual byte budgets, the 1.8 MB whole-kit ceiling, alt text, captions, textual sources, prohibited copy, narrowly scoped source exceptions, and the kit/schema revisions. The checker reads SVG and WebP dimensions without relying on a globally installed image tool and scans every declared textual source case-insensitively. Source exceptions cover only exact-case lowercase npm package tokens and the exact canonical website URL; uppercase legacy lockups remain prohibited even inside an otherwise excepted source.

Use the manifest's `alt` value when embedding an asset. Place its `caption` immediately below the image when the surrounding copy does not already state the same evidence. Decorative images must be explicitly marked and use empty alt text; this kit currently has no decorative deliverables.

The exact project-owned symbol used in the README hero is retained as the editable [SVG source](source/btst-symbol.svg).

## Verification record

2026-09-01, Node 22 and `pnpm@10.17.1`:

- Two consecutive capture runs produced identical SHA-256 hashes for all eight deliverables after the final copy and source-derivation changes.
- The asset checker passed at 206,291 bytes total against the 1.8 MB ceiling; all ten contract tests passed, including backend/client drift failures and scoped prohibited-copy exceptions.
- The generated app persisted one exact-name Media upload through the registered direct-upload route, displayed exactly one matching library card, and removed the database record and local file after each run.
- The GitHub Markdown API rendered the stable README hero reference in GFM mode. The pushed branch README was also checked at a 358 px browser viewport: the category promise and authentic Blog result remained legible without horizontal overflow.
- A production docs build rendered the corrected AI Chat proof at desktop and 390×844 mobile widths in both light and dark host themes. The image reported its complete 1600×900 natural dimensions, stayed within the content column, and produced no framework error overlay.
