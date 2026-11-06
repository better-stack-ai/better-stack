# Issue #373 browser evidence

Captured from a local Next.js 16 app using the built Core, CMS and Job Board
packages on this branch. The app uses the memory adapter and two explicitly
labelled demo jobs, not production data.

The only configured component override is:

```tsx
jobBoard: {
  pageOverrides: {
    jobBoardList: { JobRow: CustomJobRow },
  },
}
```

The recording shows built-in defaults, the custom main-list row, unchanged
built-in department rows under the same provider configuration, and the scoped
list at 390px. Captions are burned into the MP4. Each PNG is a frame from its
corresponding step.

A focused Chromium check also verified remote filtering and reset, navigation
from a department row to its job detail, no horizontal overflow at 390px, and
no browser console or page errors. The local fixture app lives in ignored
`codegen-projects/page-overrides-proof`; it is not a shipped application.

Runtime and compile-time regression coverage for all plugins is in their
`src/__tests__/page-overrides.*` files. Full suites run in PR CI.
