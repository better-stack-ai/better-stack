import { createFileRoute } from "@tanstack/react-router"
import { handler } from "@/lib/stack"

export const Route = createFileRoute("/api/data/$")({
	server: {
		handlers: {
			GET: async ({ request }) => handler(request),
			POST: async ({ request }) => handler(request),
			PUT: async ({ request }) => handler(request),
			PATCH: async ({ request }) => handler(request),
			DELETE: async ({ request }) => handler(request),
		},
	},
})
