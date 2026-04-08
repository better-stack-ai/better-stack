import { createFileRoute } from "@tanstack/react-router"
import { handler } from "@/lib/stack-auth"

export const Route = createFileRoute("/api/example-auth/$")({
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
            PATCH: async ({ request }) => {
                return handler(request)
            },
            DELETE: async ({ request }) => {
                return handler(request)
            },
        },
    },
})
