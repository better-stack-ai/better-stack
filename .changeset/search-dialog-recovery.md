---
"@btst/plugin-search": minor
"@btst/stack": patch
---

Validate successful Search responses, keep async states outside the dialog listbox,
and bound the native dialog to small viewports. Add result/loading presentation
callbacks while retaining Search-owned accessibility, navigation and recovery.
Document local embedded state using the existing scoped router mechanism and
refresh the ejectable Search registry views.

Restore case-insensitive phrase highlighting in result titles and previews, and
export SearchHighlight for custom rows receiving the current query.
