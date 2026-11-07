# Verified digital fulfillment — issue 390

Source tested: `c84609b6bbbfe71af3fc68d49fb0937a927ead02` ([PR #407](https://github.com/better-stack-ai/better-stack/pull/407)).

The 29.88-second MP4 records a real Chromium browser against the production Next.js generated consumer app. All customer, payment, capability and file data are synthetic fixtures; no real payment provider or customer data is used.

Six captioned beats show: pending payment, one active grant after duplicate verified payments, protected guest download, authenticated claiming, repeated refund revocation, and the retained admin order record. All six corresponding PNG frames were inspected for agreement with their captions.

Validation: `pnpm --filter e2e codegen:e2e:nextjs digital-fulfillment.ecommerce.spec.ts` — **1 passed**, including real protected bytes, confirmation-token misuse, wrong guest capability, cross-customer denial and repeated refund revocation. The Ecommerce package and docs production builds also passed. Full unit and E2E suites are delegated to PR CI.

The second recording starts from a fresh server and newly seeded fixture order. Captions are burned into the video. `beats.json` records six successful beats.
