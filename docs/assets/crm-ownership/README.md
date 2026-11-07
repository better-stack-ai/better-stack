# CRM ownership evidence

A 42.68-second captioned walkthrough of the generated Next.js production app.
Source: `23fc4fdd1d65fee50de4b8d3f620000228723970`; final UI implementation:
`ea8eaf80`. All records and identities are synthetic.

Six steps show the workspace pipeline, trusted staff assignment, My deals and
matching stage counts, reassignment, the filtered contact deal list, and clearing
ownership. All six screenshots were checked against their captions. The MP4
passed decoding, and the walkthrough produced no browser console or page errors.
Captions are burned into the recording.

`before-deal.png` shows the retained pre-change production build without owner
controls; its source commit was not recorded. The numbered screenshots and MP4
under `demo/` show this branch. `provenance.json` records the verified source,
identities, and capture details. Duplicate WebM and failed takes are omitted.

The focused regression passed with zero browser errors:

```sh
pnpm --filter e2e codegen:e2e:nextjs tests/smoke.crm.spec.ts -g 'assigns trusted owners'
```

The local run used port 3388 with matching API/site origins to avoid other sessions.
To record against a running generated app, run from `e2e/`, with
`DEMO_VIDEO_SKILL` pointing to the installed demo-video skill:

```sh
PRODUCT_PROOF_BASE_URL=http://localhost:3388 node "$DEMO_VIDEO_SKILL/scripts/record.mjs" product-proof/crm-ownership-demo.mjs --mp4
```

The storyboard resets only its own named fixtures before each take.
