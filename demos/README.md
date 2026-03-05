# BTST Plugin Demos

Standalone Next.js projects showcasing each BTST plugin. Each demo:

- Uses the published `@btst/stack` and `@btst/adapter-memory` packages
- Seeds demo data automatically on first server start (in-memory adapter — data resets on restart)
- Includes API Docs (`/api/data/reference`) and Route Docs (`/pages/route-docs`)
- Is embeddable on StackBlitz for live exploration

## Demos

| Demo | Plugin | Start URL |
|------|--------|-----------|
| `blog/` | Blog | `/pages/blog` |
| `ai-chat/` | AI Chat | `/pages/chat` |
| `cms/` | CMS | `/pages/cms` |
| `form-builder/` | Form Builder | `/pages/form-builder` |
| `kanban/` | Kanban | `/pages/kanban` |
| `ui-builder/` | UI Builder + CMS | `/pages/ui-builder` |

## Running locally

```bash
cd demos/blog      # or any other demo
pnpm install
pnpm dev           # dev server with hot-reload
# or
pnpm build && pnpm start  # production build
```

## AI Chat demo

The AI Chat demo requires an OpenAI API key:

```bash
cp demos/ai-chat/.env.local.example demos/ai-chat/.env.local
# Edit .env.local and add your OPENAI_API_KEY
```
