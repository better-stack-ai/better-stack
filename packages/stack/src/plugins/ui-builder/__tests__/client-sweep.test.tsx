// @vitest-environment jsdom
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	StackProvider,
	type StackClientAuth,
	type StackI18nProvider,
} from "@btst/stack/context";
import { createApiClient } from "@btst/stack/plugins/client";
import { stack } from "../../../api";
import { cmsBackendPlugin, type CMSApiRouter } from "../../cms/api";
import { cmsPermissions } from "../../cms/permissions";
import { createCMSQueryKeys } from "../../cms/query-keys";
import {
	PageRenderer,
	SuspensePageRenderer,
} from "../client/components/page-renderer";
import { PageBuilderPage } from "../client/components/pages/page-builder-page.internal";
import { PageListPage } from "../client/components/pages/page-list-page.internal";
import { PageListPage as PageListRoutePage } from "../client/components/pages/page-list-page";
import { createUIBuilderQueryKeys } from "../query-keys";
import { UI_BUILDER_CONTENT_TYPE, UI_BUILDER_TYPE_SLUG } from "../schemas";
import type { SerializedUIBuilderPage } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hooks = vi.hoisted(() => ({
	useSuspenseUIBuilderPages: vi.fn(),
	useDeleteUIBuilderPage: vi.fn(),
	useSuspenseUIBuilderPage: vi.fn(),
	useSuspenseUIBuilderPageBySlug: vi.fn(),
	useUIBuilderPageForm: vi.fn(),
}));

vi.mock("../client/hooks/ui-builder-hooks", () => hooks);
vi.mock("@btst/stack/plugins/ai-chat/client/context", () => ({
	useRegisterPageAIContext: vi.fn(),
}));
vi.mock("@workspace/ui/lib/ui-builder/store/layer-store", () => ({
	useLayerStore: { getState: vi.fn() },
}));
vi.mock("@workspace/ui/components/ui-builder/layer-renderer", () => ({
	default: ({ page }: { page: { name?: string } }) => (
		<div data-testid="rendered-public-page">{page.name}</div>
	),
}));
vi.mock("@workspace/ui/components/ui-builder", () => ({
	default: ({
		navLeftChildren,
		navRightChildren,
		onChange,
	}: {
		navLeftChildren?: ReactNode;
		navRightChildren?: ReactNode;
		onChange?: (layers: unknown[]) => void;
	}) => (
		<div data-testid="upstream-ui-builder">
			{navLeftChildren}
			{navRightChildren}
			<button
				type="button"
				onClick={() =>
					onChange?.([
						{
							id: "root",
							type: "div",
							name: "Home Page",
							props: {},
							children: [],
						},
					])
				}
			>
				Add layer
			</button>
		</div>
	),
}));

const page: SerializedUIBuilderPage = {
	id: "page-1",
	contentTypeId: "type-1",
	slug: "home",
	data: JSON.stringify({
		layers: "[]",
		variables: "[]",
		status: "draft",
	}),
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-02").toISOString(),
	parsedData: { layers: "[]", variables: "[]", status: "draft" },
	authorId: "owner-1",
};

const publicPageAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.literal("user") }),
	permissions: [cmsPermissions] as const,
	rules: ({ cms }) => [
		cms.contentType.read.when(
			({ facts }) => facts.contentType === UI_BUILDER_TYPE_SLUG,
		),
		cms.record.read.when(
			({ facts }) =>
				facts.contentType === UI_BUILDER_TYPE_SLUG && facts.scope === "record",
		),
	],
});

function publicPageAuth() {
	return createClientAuth({
		authorization: publicPageAuthorization,
		getIdentity: () => null,
	});
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	hooks.useSuspenseUIBuilderPages.mockReturnValue({
		pages: [page],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useDeleteUIBuilderPage.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
		isPending: false,
	});
	hooks.useSuspenseUIBuilderPage.mockReturnValue({ page, refetch: vi.fn() });
	hooks.useSuspenseUIBuilderPageBySlug.mockReturnValue({
		page,
		layers: [
			{
				id: "root",
				type: "div",
				name: "Public home",
				props: {},
				children: [],
			},
		],
		variables: [],
		refetch: vi.fn(),
	});
	hooks.useUIBuilderPageForm.mockReturnValue({
		action: "create",
		record: null,
		isLoadingRecord: false,
		recordError: null,
		defaultValues: undefined,
		submit: vi.fn().mockResolvedValue(page),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		clearErrors: vi.fn(),
	});
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	document.body.innerHTML = "";
	queryClient.clear();
	vi.clearAllMocks();
});

function createMockRouter() {
	return {
		navigate: vi.fn(),
		getSearchParams: () => new URLSearchParams(),
		setSearchParams: vi.fn(),
	};
}

function overrides() {
	return {
		queryClient,
		componentRegistry: {},
	};
}

async function renderPage(
	pageNode: ReactNode,
	options: {
		auth?: StackClientAuth;
		initialIdentity?: { id: string; role: "user" } | null;
		i18n?: StackI18nProvider;
		notify?: {
			success: ReturnType<typeof vi.fn>;
			error: ReturnType<typeof vi.fn>;
		};
		localization?: Record<string, unknown>;
	} = {},
) {
	await act(async () => {
		root.render(
			<StackProvider
				basePath="/pages"
				api={{ baseURL: "http://test.local", basePath: "/api/data" }}
				router={createMockRouter()}
				overrides={{
					"ui-builder": { ...overrides(), localization: options.localization },
				}}
				auth={options.auth}
				initialIdentity={options.initialIdentity}
				i18n={options.i18n}
				notify={options.notify}
			>
				{pageNode}
			</StackProvider>,
		);
	});
}

function buttonWithText(text: string) {
	return Array.from(
		document.querySelectorAll<HTMLButtonElement>("button"),
	).find((button) => button.textContent?.includes(text));
}

describe("UI Builder query keys", () => {
	it("matches the underlying CMS keys used by SSR and CMS consumers", () => {
		const client = createApiClient<CMSApiRouter>({
			baseURL: "http://test.local",
			basePath: "/api/data",
		});
		const uiBuilderQueries = createUIBuilderQueryKeys(client);
		const cmsQueries = createCMSQueryKeys(client);

		expect(
			uiBuilderQueries.cmsContent.list({ limit: 10, offset: 0 }).queryKey,
		).toEqual(
			cmsQueries.cmsContent.list({
				typeSlug: UI_BUILDER_TYPE_SLUG,
				limit: 10,
				offset: 0,
			}).queryKey,
		);
		expect(uiBuilderQueries.cmsContent.detail(page.id).queryKey).toEqual(
			cmsQueries.cmsContent.detail(UI_BUILDER_TYPE_SLUG, page.id).queryKey,
		);
	});
});

describe("UI Builder page permissions", () => {
	it("keeps create controls visible without an auth provider", async () => {
		await renderPage(<PageListPage />);
		expect(document.body.textContent).toContain("Create Page");
	});

	it("uses the CMS catalog for read, create, update, and delete controls", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [
				cms.record.read.allow(),
				cms.record.create.when(
					({ facts }) => facts.contentType === UI_BUILDER_TYPE_SLUG,
				),
				cms.record.update.when(
					({ identity, facts }) =>
						facts.contentType === UI_BUILDER_TYPE_SLUG &&
						facts.recordId === page.id &&
						facts.authorId === identity?.id,
				),
				cms.record.delete.when(() => false),
			],
		});
		const identity = { id: "owner-1", role: "user" as const };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});

		expect(
			authorization.can(
				cmsPermissions.record.read({
					contentType: UI_BUILDER_TYPE_SLUG,
					scope: "collection",
				}),
				identity,
			),
		).toBe(true);
		expect(
			authorization.can(
				cmsPermissions.record.update({
					contentType: UI_BUILDER_TYPE_SLUG,
					recordId: page.id,
					authorId: page.authorId,
				}),
				identity,
			),
		).toBe(true);
		expect(
			authorization.can(
				cmsPermissions.record.delete({
					contentType: UI_BUILDER_TYPE_SLUG,
					recordId: page.id,
					authorId: page.authorId,
				}),
				identity,
			),
		).toBe(false);

		await renderPage(<PageListRoutePage />, {
			auth,
			initialIdentity: identity,
		});
		expect(document.body.textContent).toContain("Create Page");

		const actionsTrigger =
			container.querySelector<HTMLButtonElement>("tbody button")!;
		await act(async () => {
			actionsTrigger.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
			);
		});
		const actions = Array.from(
			document.querySelectorAll<HTMLElement>("[role=menuitem]"),
		).map((item) => item.textContent);
		expect(actions).toContain("Edit");
		expect(actions).not.toContain("Delete");
	});
});

describe("UI Builder public page authorization", () => {
	it("serves a real anonymous CMS page with the shared public rules", async () => {
		const backend = stack({
			basePath: "/api",
			plugins: {
				cms: cmsBackendPlugin({ contentTypes: [UI_BUILDER_CONTENT_TYPE] }),
			},
			adapter: (db) => createMemoryAdapter(db)({}),
			auth: createServerAuth({
				authorization: publicPageAuthorization,
				getIdentity: () => null,
			}),
		});
		await backend.internal.cms.createContentItem({
			typeSlug: UI_BUILDER_TYPE_SLUG,
			body: {
				slug: "home",
				data: { layers: "[]", variables: "[]", status: "published" },
			},
		});

		const response = await backend.handler(
			new Request(
				`http://localhost/api/content/${UI_BUILDER_TYPE_SLUG}?slug=home&limit=1`,
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			items: [
				{
					slug: "home",
					contentType: { slug: UI_BUILDER_TYPE_SLUG },
				},
			],
		});
	});

	it("renders a cold anonymous browser page when the CMS read is public", async () => {
		expect(
			publicPageAuthorization.can(
				cmsPermissions.contentType.read({
					contentType: UI_BUILDER_TYPE_SLUG,
				}),
				null,
			),
		).toBe(true);
		expect(
			publicPageAuthorization.can(
				cmsPermissions.record.read({
					contentType: UI_BUILDER_TYPE_SLUG,
					scope: "collection",
				}),
				null,
			),
		).toBe(false);
		await renderPage(<PageRenderer slug="home" />, { auth: publicPageAuth() });

		expect(document.body.textContent).toContain("Public home");
	});

	it("renders anonymous SSR and SSG output from an explicitly public CMS read", () => {
		const ssr = renderToString(
			<StackProvider
				basePath="/pages"
				auth={publicPageAuth()}
				initialIdentity={null}
				overrides={{ "ui-builder": overrides() }}
			>
				<SuspensePageRenderer slug="home" />
			</StackProvider>,
		);
		const ssg = renderToStaticMarkup(
			<StackProvider
				basePath="/pages"
				auth={publicPageAuth()}
				initialIdentity={null}
				overrides={{ "ui-builder": overrides() }}
			>
				<SuspensePageRenderer slug="home" />
			</StackProvider>,
		);

		expect(ssr).toContain("Public home");
		expect(ssg).toContain("Public home");
	});

	it("keeps the public declaration authoritative for one-rule providers", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [cms.record.read.when(() => false)],
		});
		const auth = createClientAuth({ authorization, getIdentity: () => null });

		await renderPage(<PageRenderer slug="home" />, {
			auth,
			initialIdentity: null,
		});

		expect(document.body.textContent).not.toContain("Public home");
	});

	it("does not render when the embedded content type is denied", async () => {
		const recordOnlyAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [cms.record.read.allow()],
		});
		const auth = createClientAuth({
			authorization: recordOnlyAuthorization,
			getIdentity: () => null,
		});

		await renderPage(<PageRenderer slug="home" />, { auth });

		expect(document.body.textContent).not.toContain("Public home");
	});
});

describe("UI Builder notifications and localization", () => {
	it("sends delete success through the notify provider", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		await renderPage(<PageListPage />, { notify });

		const actionsTrigger =
			container.querySelector<HTMLButtonElement>("tbody button")!;
		await act(async () => {
			actionsTrigger.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
			);
		});
		const deleteItem = Array.from(
			document.querySelectorAll<HTMLElement>("[role=menuitem]"),
		).find((item) => item.textContent?.includes("Delete"));
		await act(async () => deleteItem?.click());
		const deleteButtons = Array.from(
			document.querySelectorAll<HTMLButtonElement>("button"),
		).filter((button) => button.textContent === "Delete");
		await act(async () => deleteButtons.at(-1)?.click());

		expect(
			hooks.useDeleteUIBuilderPage.mock.results[0]!.value.mutateAsync,
		).toHaveBeenCalledWith(page.id);
		expect(notify.success).toHaveBeenCalledWith("Page deleted successfully");
		expect(notify.error).not.toHaveBeenCalled();
	});

	it("routes copy through i18n and lets localization overrides win", async () => {
		hooks.useSuspenseUIBuilderPages.mockReturnValue({
			pages: [],
			total: 0,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});
		const translate = vi.fn((key: string, fallback: string) =>
			key === "uiBuilder.pageList.emptyState.title"
				? "Noch keine Seiten"
				: fallback,
		);

		await renderPage(<PageListPage />, { i18n: { translate } });
		expect(document.body.textContent).toContain("Noch keine Seiten");

		await act(async () => root.unmount());
		root = createRoot(container);
		await renderPage(<PageListPage />, {
			i18n: { translate },
			localization: { pageList: { emptyState: { title: "Custom empty" } } },
		});
		expect(document.body.textContent).toContain("Custom empty");
	});
});

describe("UI Builder editor resource form", () => {
	it("uses the notify provider for local validation", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		await renderPage(<PageBuilderPage />, { notify });

		await act(async () => buttonWithText("Save")?.click());

		expect(notify.error).toHaveBeenCalledWith("Slug is required");
		expect(
			hooks.useUIBuilderPageForm.mock.results[0]!.value.submit,
		).not.toHaveBeenCalled();
	});

	it("submits editor state through the resource form", async () => {
		await renderPage(<PageBuilderPage />);
		await act(async () => buttonWithText("Add layer")?.click());
		await act(async () => buttonWithText("Save")?.click());

		expect(
			hooks.useUIBuilderPageForm.mock.results.at(-1)!.value.submit,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				slug: "home-page",
				status: "draft",
				layers: [expect.objectContaining({ id: "root" })],
			}),
		);
	});

	it("renders server slug errors inline", async () => {
		hooks.useUIBuilderPageForm.mockReturnValue({
			action: "create",
			record: null,
			isLoadingRecord: false,
			recordError: null,
			defaultValues: undefined,
			submit: vi.fn(),
			isSubmitting: false,
			error: new Error("Validation failed"),
			fieldErrors: { slug: "Slug is invalid" },
			clearErrors: vi.fn(),
		});

		await renderPage(<PageBuilderPage />);
		expect(document.body.textContent).toContain("Slug is invalid");
		expect(container.querySelector("input[aria-invalid=true]")).toBeTruthy();
	});
});
