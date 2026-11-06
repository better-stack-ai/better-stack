# Blog page-card PR evidence

Captured from source commit `492e8007` in an isolated local Next.js fixture.
The fixture uses the built Blog package, its resolved built-in routes,
`StackProvider`, and the Blog HTTP API with an in-memory adapter. Content and
the permissive authorization policy are local demo fixtures.

`blog-page-cards.mp4` is a 23-second captioned browser recording:

1. No card overrides: the published page renders its built-in cards.
2. `pageOverrides.posts.PostCard`: the published page renders Published cards.
3. `pageOverrides.tag.PostCard`: the tag page renders Tag cards.
4. `pageOverrides.post.PostCard`: Keep Reading renders Recommendation cards.
5. No drafts override: the draft list falls back to the shared `PostCard`.

The five PNG files show those steps. Captions are burned into the video.
Each scoped step asserts that another page's card did not appear. All five
steps passed, and each screenshot was visually checked against its caption.

The example cards, navigation header, seeded content, and local fixture are
demonstration configuration, not changes to the package's default appearance.
