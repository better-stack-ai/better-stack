# Playground measurement

Introduced by the organic-growth responsibility on 2026-09-10. The deployment
verification record in `better-stack-web` establishes the effective live time.

The public `/playground` route is proxied through `www.better-stack.ai`. Its
same-origin `/_vercel/insights/*` requests use the main website's existing Vercel
Web Analytics project, as the documentation proxy already does. A separate
playground-project analytics dashboard is not needed for this collection path.

The analytics component accepts only the canonical public origin and reports
the single `/playground` path, removing query parameters and fragments. Preview
and direct deployment origins are excluded. Events contain only the framework
enum and, for generation, the fixed source label. No generated files, submitted
content, user IDs, auth data, preview URLs, or arbitrary plugin query strings are
event properties.

| Signal | Definition | Limitation |
| --- | --- | --- |
| `/playground` pageview | Browser visit recorded by Vercel Analytics | Not a unique adopter or successful demo |
| `playground_project_generated` | Project-generation action returned successfully to the browser | Files generated; does not establish embed or dev-server readiness |
| `source=button` | Generation from the Open in Editor button | May include repeated evaluations by one visitor |
| `source=shared_url` | Generation on a shared/refreshed preview URL | Not necessarily a new evaluation |
| `playground_embed_connected` | StackBlitz SDK returned a connected VM | Package installation and dev-server boot may still fail |

Compare only windows after this instrumentation became live. The absence of
earlier playground events is a measurement gap, not a zero-usage baseline.
Automated browser verification can contribute synthetic observations and should
be disclosed when interpreting the first day's small counts. These signals do
not establish npm installation, repository adoption, or cross-system conversion.
