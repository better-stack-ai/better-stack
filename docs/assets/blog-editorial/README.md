# Blog editorial workflow capture

A 44.8-second captioned walkthrough of the real generated Next.js production
app. Source: `cf49db883169253ba0b5b8489b373df06eb42c80`; implementation:
`43ae1d3939fa62b873b6c8378c78fc2328a48d94`. The later source commit corrects only
the evidence storyboard. No feature source changed between the verified build
and this capture.

All posts and identities are synthetic. The local app uses the memory adapter
and test-only mock sessions: an author, a reviewer with no content-update grant,
and an anonymous reader. The demo omits the test fixture's favicon image.

Eight assertion-backed steps show draft creation, submission, requested changes,
a real title/body revision, approval, publication, later private title/slug
changes, and the unchanged approved public version. The final step also checks
Open Graph metadata, search isolation, and sitemap URLs. All eight screenshots
were inspected against their captions; the MP4 decoded successfully. There were
no browser console or page errors.

The storyboard is `e2e/product-proof/blog-editorial-demo.mjs`; the focused
regression is `e2e/tests/smoke.editorial.ssg.spec.ts`. `beats.json` lists the
screenshots. `provenance.json` records the source, tool, mock identities, port,
and assertions.

To reproduce, start the generated production app on a free port and run from
`e2e/`, with `DEMO_VIDEO_SKILL` pointing to the installed demo-video skill:

```sh
PRODUCT_PROOF_BASE_URL=http://localhost:3106 node "$DEMO_VIDEO_SKILL/scripts/record.mjs" product-proof/blog-editorial-demo.mjs --out ../docs/assets/blog-editorial --mp4
```

The capture used port 3106 to avoid another session's app on the normal codegen
port. The storyboard deletes only its own deterministic demo posts before each
take. Captions are burned into the video. Only the final MP4, eight PNGs, and
small metadata files are retained; temporary takes and duplicate WebM are omitted.
