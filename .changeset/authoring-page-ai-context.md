---
"@btst/plugin-ai-chat": minor
"@btst/plugin-affiliate": minor
"@btst/plugin-analytics": minor
"@btst/plugin-calendar": minor
"@btst/plugin-cms": minor
"@btst/plugin-ecommerce": minor
"@btst/plugin-feature-flags": minor
"@btst/plugin-form-builder": minor
"@btst/plugin-kanban": minor
"@btst/plugin-newsletter": minor
"@btst/plugin-school": minor
---

Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.

Newsletter adds an optional persisted `previewText` field and escaped email preheader. Persistent adapters must add a nullable string `previewText` field to `newsletterCampaign`; existing campaigns require no backfill.
