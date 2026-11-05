# Registry integration fixtures

The Auto Form snapshot keeps the existing upstream registry install/build
exception deterministic. Production items continue to reference its upstream
registry; `test-registry.sh` rewrites only its temporary served copy.

| Fixture | Upstream revision |
| --- | --- |
| `auto-form.json` | `better-stack-ai/form-builder@5e0f42e47ff4a87c4c32e20721bfeda955edbef6` |

UI Builder and the distinct Minimal Tiptap variants are maintained public
compatibility items in `packages/stack/registry-sources`; the same generated
items are consumed by ordinary installations and the integration harness.
