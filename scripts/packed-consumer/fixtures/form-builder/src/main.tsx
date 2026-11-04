import { formBuilderClientPlugin } from "@btst/plugin-form-builder/client";
import { FormRenderer } from "@btst/plugin-form-builder/client/components";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import "@btst/plugin-form-builder/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const form = {
	id: "packed-form",
	name: "Packed contact",
	slug: "contact",
	status: "active",
	schema: JSON.stringify({
		type: "object",
		properties: { name: { type: "string", title: "Your name", minLength: 1 } },
		required: ["name"],
	}),
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};
globalThis.fetch = async (_input, init) => {
	if (init?.method === "POST") {
		const body = JSON.parse(String(init.body));
		if (body.data.name !== "Ada") throw new Error("Unexpected submitted data");
		return Response.json({
			id: "submission",
			formId: form.id,
			data: JSON.stringify(body.data),
			submittedAt: "2026-01-02T00:00:00Z",
			form: { successMessage: "Packed submission accepted" },
		});
	}
	return Response.json(form);
};
const queryClient = new QueryClient();
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api/data" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { formBuilder: formBuilderClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [formBuilderPermissions],
	rules: ({ forms }) => [
		forms.form.render.allow(),
		forms.submission.create.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({ authorization, getIdentity: () => null })}
			initialIdentity={null}
		>
			<FormRenderer slug="contact" />
		</StackProvider>
	</QueryClientProvider>,
);
