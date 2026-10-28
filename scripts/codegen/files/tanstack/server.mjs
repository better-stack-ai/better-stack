import { serve } from "srvx/node";
import { staticMiddleware } from "srvx/static";
import { posix } from "node:path";
import handler from "./dist/server/server.js";

const uploads = staticMiddleware({ dir: "public" });

serve({
	middleware: [
		(request, next) => {
			let pathname;
			try {
				pathname = posix.normalize(
					decodeURI(new URL(request.url).pathname).replaceAll("\\", "/"),
				);
			} catch {
				return new Response("Bad request", { status: 400 });
			}
			return pathname.startsWith("/uploads/")
				? uploads(request, () => new Response("Not found", { status: 404 }))
				: next();
		},
		staticMiddleware({ dir: "dist/client" }),
	],
	fetch: (request) => handler.fetch(request),
});
