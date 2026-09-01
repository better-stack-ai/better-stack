# Registry integration fixtures

These snapshots keep the required UI Builder-over-CMS registry install/build
test deterministic. Production registry items continue to reference their
upstream registries; `test-registry.sh` rewrites only its temporary served
copies to these checked-in artifacts.

| Fixture | Upstream revision |
| --- | --- |
| `ui-builder.json` | `olliethedev/ui-builder@bc1ceda306935bba87c2760fd213725f9133013b` |
| `auto-form.json` | `better-stack-ai/form-builder@5e0f42e47ff4a87c4c32e20721bfeda955edbef6` |
| `minimal-tiptap.json` | `olliethedev/shadcn-minimal-tiptap@456908f0be88a38a6ab31518a22405d5d269739f` |

Refresh a snapshot only when intentionally adopting an upstream registry
revision, then rerun the full registry install/build validation.
