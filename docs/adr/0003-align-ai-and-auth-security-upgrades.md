# Align AI and Auth dependency cohorts

Upgrade the optional AI plugin to AI SDK 7 with `@ai-sdk/react` 4 and matching
provider packages. This removes the AI SDK 5 dependency on Undici 5. Keep BTST's
`systemPrompt` configuration, pass it as SDK instructions, and reject caller
system/data messages before model execution. Keep existing history authorization,
identity partitioning, transaction guards, and client tool execution behavior.
Reconstruct each tool step from the SDK's initial and response messages before
reapplying compaction, because SDK 7 carries message overrides into later steps.
The AI plugin now requires Node 22; the current React 19, Next 15+, and React Router 7+ consumer contracts remain.

Upgrade the DB/adapters/CLI together to the stable 3.0.1 patch prepared against
published Better Auth/core 1.7.14 and utils 0.5.1. The published 3.0.0 packages pin
Auth 1.7.6 exactly, so overriding their peers would not be a supported upgrade.
The aligned patch also refreshes the vendored adapter fixes from upstream's exact
stable tag and preserves BTST's memory transaction Date comparison patch.

The DB patch is prepared in the Auth fork and must be published before this
BTST dependency change can be installed from the public registry. Local validation
uses the packed release artifacts. Review database schema/index migrations before
applying them in existing applications.

The Auth fork also fixes session-list pagination introduced in upstream 1.7.14.
This fix affects the configuration combining secondary storage with
`session.storeSessionInDatabase: true` and without
`session.preserveSessionInDatabase: true`. The DB packages depend on official npm
Better Auth, so publishing them does not ship this fork-only Auth fix. Avoid that
configuration until the official package includes the correction; the default
database session configuration is unaffected.

The workspace pins the typography plugin's selector parser to patched 6.1.5 for
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
Two low-severity upstream findings remain: `rehype-katex` still requires KaTeX
0.16, while the [KaTeX fix](https://github.com/advisories/GHSA-238p-pmpm-9mq7)
starts at 0.18.2; `unbuild`'s Rollup resolver uses `deepmerge`, which has
[no patched release](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
Do not force a different KaTeX major or replace the build system in this upgrade.
