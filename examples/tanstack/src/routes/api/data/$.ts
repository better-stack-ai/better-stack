import { createFileRoute } from "@tanstack/react-router"
import { handler } from "@/lib/stack"


export const Route = createFileRoute("/api/data/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return handler(request)
      },
      POST: async ({ request }) => {
        return handler(request)
      },
      PUT: async ({ request }) => {
        return handler(request)
      },
      DELETE: async ({ request }) => {
        return handler(request)
      },
    },
  },
})