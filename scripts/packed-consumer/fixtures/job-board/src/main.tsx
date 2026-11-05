import { jobBoardClientPlugin } from "@btst/plugin-job-board/client";
import { JobDetailPageComponent } from "@btst/plugin-job-board/client/components";
import { jobBoardPermissions } from "@btst/plugin-job-board/permissions";
import "@btst/plugin-job-board/css";
import { cmsClientPlugin } from "@btst/plugin-cms/client";
import { formBuilderClientPlugin } from "@btst/plugin-form-builder/client";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const withForms =
	new URL(window.location.href).searchParams.get("forms") === "1";
const job = {
	id: "v5-job",
	slug: "packed-role",
	title: "Packed role",
	department: "Engineering",
	location: "London",
	employmentType: "full-time",
	remote: true,
	description: "Build **useful software**.",
	requirements: "Relevant experience.",
	status: "published",
	closingDate: "2099-02-01",
	applicationFormSlug: "application",
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};
const form = {
	id: "application-form",
	name: "Application",
	slug: "application",
	status: "active",
	schema: JSON.stringify({
		type: "object",
		properties: { name: { type: "string", title: "Your name", minLength: 1 } },
		required: ["name"],
	}),
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};
globalThis.fetch = async (input, init) => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	if (init?.method === "POST") {
		const body = JSON.parse(String(init.body));
		if (body.data.name !== "Ada")
			throw new Error("Unexpected application data");
		return Response.json({
			id: "submission",
			formId: form.id,
			data: JSON.stringify(body.data),
			submittedAt: "2026-01-02T00:00:00Z",
			form: { successMessage: "Application received" },
		});
	}
	if (url.includes("/jobs/")) return Response.json(job);
	if (url.includes("/forms/")) {
		if (!withForms)
			throw new Error("Unregistered Form Builder must not be queried");
		return Response.json(form);
	}
	throw new Error(`Unexpected request ${url}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: window.location.origin, basePath: "/api" },
	site: { baseURL: window.location.origin, basePath: "/pages" },
	queryClient,
	plugins: {
		cms: cmsClientPlugin(),
		jobBoard: jobBoardClientPlugin(),
		...(withForms ? { formBuilder: formBuilderClientPlugin() } : {}),
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [jobBoardPermissions, formBuilderPermissions],
	rules: ({ jobBoard, forms }) => [
		jobBoard.job.read.allow(),
		forms.form.render.allow(),
		forms.submission.create.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({ authorization, getIdentity: () => null })}
			initialIdentity={null}
		>
			<JobDetailPageComponent slug="packed-role" />
		</StackProvider>
	</QueryClientProvider>,
);
