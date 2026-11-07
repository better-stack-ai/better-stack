# Full-order refund evidence

The before screenshot shows the paid-order administration page at `0e09498a`.
The implementation captured after the change is `54074f1c`, including integration with
`main` at `4ad23019`.
The captioned MP4 and four after screenshots walk through the real Ecommerce
plugin UI: saved amount, explicit confirmation, a lost provider response, and
provider reconciliation. All buyers, payments, products, and sessions are fixtures.
No real payment provider is called.

The capture uses an isolated local Next.js app with the CMS product schema,
Ecommerce backend/client plugins, serialized memory adapter, and the generated
apps' signed demo payment adapter. Its provider accepts the refund and loses the
creation response; reconciliation retrieves the provider's confirmed result.
The assertions also check repeated initiation and payment events, the immutable
refund amount, and unchanged inventory, physical fulfillment status, and discount use.

The refreshed capture includes the integrated warning that verified refunds revoke
digital access. The notebook is physical and has no digital delivery grants; the
recording demonstrates financial recovery and preserves physical fulfillment.

The source storyboard is `e2e/product-proof/refund-demo.mjs`. The focused regression
is the `full-order refund` test in `e2e/tests/smoke.ecommerce.spec.ts` and runs
across the generated apps in CI. Local verification uses only that test against
the isolated Ecommerce app.

To reproduce, start a fresh generated app with the demo payment adapter on a free
port and run from `e2e/`:

```sh
PRODUCT_PROOF_BASE_URL=http://localhost:3109 node "$DEMO_VIDEO_SKILL/scripts/record.mjs" product-proof/refund-demo.mjs --out ../docs/assets/refunds/after --mp4
```

`DEMO_VIDEO_SKILL` points to the installed demo-video skill. Restart the isolated
memory-backed app before each take; every take seeds a fresh product and order.
Captions are burned into the video. The retained MP4 and PNGs are the final
verified take; temporary takes and the duplicate WebM are omitted.

All five retained screenshots were inspected against the shown UI and captions.
The four demo beats passed, the MP4 decoded successfully, and no browser console
or page errors occurred. The final clip is 16.88 seconds. `provenance.json`
records source commits, synthetic identities, assertions, and file hashes.

The focused regression also exercises a failure after the financial commit:
Playwright fetches the real successful reconciliation response, then returns a
controlled HTTP503 to the browser. Before the UI refresh fix, the refund overview
was confirmed while the order summary still showed paid (failure in 8.3s).
After the fix, the same test passed in 3.7s and both views showed the confirmed
financial outcome despite the error. The demo itself uses the normal unmodified
response path.
