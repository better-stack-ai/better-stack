# Public editor compatibility sources

The registry generator writes three dependency items from these snapshots.
UI Builder keeps the Markdown editor variant; Kanban keeps the image-upload
configuration variant. Plugin registration IDs and the component implementations
remain unchanged.

| Source | Upstream revision |
| --- | --- |
| `ui-builder.json` | `olliethedev/ui-builder@bc1ceda306935bba87c2760fd213725f9133013b` |
| `minimal-tiptap-markdown.json` | `olliethedev/shadcn-minimal-tiptap@456908f0be88a38a6ab31518a22405d5d269739f` |
| `minimal-tiptap-image-upload.json` | `olliethedev/shadcn-minimal-tiptap@cb5a0519bb9cfc80624aa0aecd7466f0f24c382d` |

Both Minimal Tiptap sources capture the parent `addOptions` result once and
supply `exitOnArrowUp: parent?.exitOnArrowUp ?? true`. This retains inherited
settings and the SDK default while satisfying Tiptap 3.32.2's required option.
The generator selects exact Tiptap 3.32.2 direct dependencies, rewrites the
UI Builder editor dependency to the matching owned Markdown item, and preserves
upstream files and Tailwind metadata. Source revisions and full license notices
are included in each generated item's metadata; license files are kept here.

These are public registry dependencies, consumed by ordinary shadcn installs.
The integration harness serves the same generated items locally; it does not
substitute one editor variant for another. Its separate Auto Form fixture and
inherited upstream TypeScript accommodations remain test-only limitations.

Refresh a source deliberately against its upstream revision, retain its license
and provider behavior, regenerate the registry, and run the complete install/build
workflow. Do not replace the image-upload configuration variant with Markdown.
