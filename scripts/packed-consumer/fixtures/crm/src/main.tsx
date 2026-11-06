import { crmClientPlugin } from "@btst/plugin-crm/client";
import { useSearchContacts } from "@btst/plugin-crm/client/hooks";
import { PipelinePageComponent } from "@btst/plugin-crm/client/components";
import { crmPermissions } from "@btst/plugin-crm/permissions";
import type { Pipeline } from "@btst/plugin-crm/types";
import { kanbanClientPlugin } from "@btst/plugin-kanban/client";
import "@btst/plugin-crm/css";
import "./fixture.css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { z } from "zod";

const timestamp = "2026-01-01T00:00:00Z";
const initial: Pipeline = {
	id: "pipeline",
	name: "Packed sales",
	slug: "packed-sales",
	createdAt: timestamp,
	updatedAt: timestamp,
	columns: [
		{
			id: "lead",
			title: "Lead",
			boardId: "pipeline",
			order: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
			tasks: [
				{
					id: "task",
					title: "Packed deal",
					columnId: "lead",
					priority: "MEDIUM",
					order: 0,
					isArchived: false,
					createdAt: timestamp,
					updatedAt: timestamp,
				},
			],
		},
		{
			id: "qualified",
			title: "Qualified",
			boardId: "pipeline",
			order: 1,
			createdAt: timestamp,
			updatedAt: timestamp,
			tasks: [],
		},
	],
	deals: [
		{
			id: "deal",
			taskId: "task",
			title: "Packed deal",
			pipelineId: "pipeline",
			stage: "lead",
			value: 1000,
			currency: "USD",
			status: "open",
			createdAt: timestamp,
			updatedAt: timestamp,
		},
	],
};
let pipeline: Pipeline = JSON.parse(
	localStorage.getItem("packed-crm") ?? JSON.stringify(initial),
);
globalThis.fetch = async (input, init) => {
	const url = new URL(String(input));
	if (init?.method === "POST" && url.pathname.endsWith("/move")) {
		const { stage, order } = JSON.parse(String(init.body));
		const task = pipeline.columns.flatMap((column) => column.tasks)[0]!;
		pipeline = {
			...pipeline,
			columns: pipeline.columns.map((column) => ({
				...column,
				tasks: column.id === stage ? [{ ...task, columnId: stage, order }] : [],
			})),
			deals: pipeline.deals.map((deal) => ({ ...deal, stage })),
		};
		localStorage.setItem("packed-crm", JSON.stringify(pipeline));
		return Response.json(pipeline.deals[0]);
	}
	if (url.pathname.includes("/crm/pipelines/")) return Response.json(pipeline);
	if (
		url.pathname.endsWith("/crm/contacts") &&
		url.searchParams.get("search") === "Ada"
	) {
		if (
			new Headers(init?.headers).get("x-fixture") !== "shared-runtime" ||
			init?.credentials !== "include"
		)
			throw new Error("Contact search lost shared API credentials");
		return Response.json({
			items: [
				{
					id: "contact",
					firstName: "Ada",
					tags: [],
					customFields: {},
					createdAt: timestamp,
					updatedAt: timestamp,
				},
			],
			total: 1,
		});
	}
	return Response.json({ items: [], total: 0 });
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { kanban: kanbanClientPlugin(), crm: crmClientPlugin() },
	endpoints: {
		crm: {
			api: {
				basePath: "/api",
				browserHeaders: { "x-fixture": "shared-runtime" },
				credentials: "include",
			},
		},
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [crmPermissions],
	rules: ({ crm }) => [
		crm.pipeline.read.allow(),
		crm.deal.read.allow(),
		crm.deal.move.allow(),
		crm.deal.create.allow(),
		crm.contact.read.allow(),
		crm.company.read.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
function ContactSearch() {
	const search = useSearchContacts();
	const [result, setResult] = useState("");
	return (
		<>
			<button
				onClick={async () =>
					setResult(
						(await search({ search: "Ada" })).items[0]?.firstName ?? "Missing",
					)
				}
			>
				Search contacts
			</button>
			<output>{result}</output>
		</>
	);
}
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "operator" }),
			})}
			initialIdentity={{ id: "operator" }}
			overrides={{
				kanban: {
					uploadImage: async () => "",
					resolveUser: async () => null,
					searchUsers: async () => [],
				},
			}}
		>
			<PipelinePageComponent pipelineId="pipeline" />
			<ContactSearch />
		</StackProvider>
	</QueryClientProvider>,
);
