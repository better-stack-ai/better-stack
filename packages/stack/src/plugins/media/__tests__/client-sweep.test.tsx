// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { createClientAuth } from "@btst/stack/authorization/client";
import { defineAuthorization } from "@btst/stack/authorization";
import { z } from "zod";
import { mediaPermissions } from "../permissions";
import { LibraryPage } from "../client/components/pages/library-page.internal";
import { LibraryPageComponent } from "../client/components/pages/library-page";
import { MediaPicker } from "../client/components/media-picker";
import { UrlTab } from "../client/components/media-picker/url-tab";
import type { SerializedAsset, SerializedFolder } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const hooks = vi.hoisted(() => ({
	useAssets: vi.fn(),
	useFolders: vi.fn(),
	useUploadAsset: vi.fn(),
	useDeleteAsset: vi.fn(),
	useDeleteFolder: vi.fn(),
	useCreateFolderForm: vi.fn(),
	useRegisterAssetForm: vi.fn(),
}));

vi.mock("../client/hooks/use-media", () => hooks);
vi.mock("@workspace/ui/hooks/use-route-lifecycle", () => ({
	useRouteLifecycle: vi.fn(),
}));

const asset: SerializedAsset = {
	id: "asset-1",
	filename: "beach.jpg",
	originalName: "Beach.jpg",
	mimeType: "image/jpeg",
	size: 1024,
	url: "https://cdn.example.com/beach.jpg",
	createdAt: new Date("2024-01-01").toISOString(),
};

const folder: SerializedFolder = {
	id: "folder-1",
	name: "Photos",
	createdAt: new Date("2024-01-01").toISOString(),
};

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

	hooks.useAssets.mockReturnValue({
		data: { pages: [{ items: [asset], total: 1 }] },
		fetchNextPage: vi.fn(),
		hasNextPage: false,
		isFetchingNextPage: false,
		isLoading: false,
	});
	hooks.useFolders.mockImplementation((parentId?: string | null) => ({
		data: parentId === null ? [folder] : [],
	}));
	hooks.useUploadAsset.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue(asset),
		isPending: false,
	});
	hooks.useDeleteAsset.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
	});
	hooks.useDeleteFolder.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
	});
	hooks.useCreateFolderForm.mockReturnValue({
		submit: vi.fn().mockResolvedValue(folder),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		clearErrors: vi.fn(),
	});
	hooks.useRegisterAssetForm.mockReturnValue({
		submit: vi.fn().mockResolvedValue(asset),
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

function createMockRouter(initial = "") {
	let params = new URLSearchParams(initial);
	const setSearchParams = vi.fn(
		(next: URLSearchParams, _options?: { replace?: boolean }) => {
			params = new URLSearchParams(next.toString());
		},
	);
	return {
		navigate: vi.fn(),
		getSearchParams: () => new URLSearchParams(params.toString()),
		setSearchParams,
	};
}

const mediaOverrides = () => ({
	queryClient,
});

async function renderLibrary(
	options: {
		auth?: StackAuthProvider;
		i18n?: StackI18nProvider;
		router?: ReturnType<typeof createMockRouter>;
		initialIdentity?: { id: string; role?: string } | null;
	} = {},
) {
	const router = options.router ?? createMockRouter();
	await act(async () => {
		root.render(
			<StackProvider
				basePath="/pages"
				api={{ baseURL: "http://test.local", basePath: "/api/data" }}
				router={router}
				overrides={{ media: mediaOverrides() }}
				auth={options.auth}
				initialIdentity={options.initialIdentity}
				i18n={options.i18n}
			>
				<LibraryPage />
			</StackProvider>,
		);
	});
	return router;
}

function typeInto(input: HTMLInputElement, value: string) {
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)!.set!;
	setValue.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function waitFor(check: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("Media library route permission", () => {
	const routeAuthorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.enum(["viewer", "editor"]) }),
		permissions: [mediaPermissions] as const,
		rules: ({ media }) => [
			media.library.read.when(({ identity }) => identity?.role === "editor"),
			media.asset.read.allow(),
		],
	});

	it.each([
		{ label: "anonymous", identity: null },
		{
			label: "authenticated viewer",
			identity: { id: "viewer-1", role: "viewer" as const },
		},
	])(
		"fails closed for an $label at the real route boundary",
		async ({ identity }) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(console, "warn").mockImplementation(() => {});
			const auth = createClientAuth({
				authorization: routeAuthorization,
				getIdentity: () => identity,
			});
			await act(async () => {
				root.render(
					<StackProvider
						basePath="/pages"
						router={createMockRouter()}
						overrides={{ media: mediaOverrides() }}
						auth={auth}
						initialIdentity={identity}
					>
						<LibraryPageComponent />
					</StackProvider>,
				);
			});
			await waitFor(
				() => document.body.textContent?.includes("Unauthorized") ?? false,
			);

			expect(hooks.useAssets).not.toHaveBeenCalled();
		},
	);

	it("renders the real route for an allowed authenticated identity", async () => {
		const identity = { id: "editor-1", role: "editor" as const };
		const auth = createClientAuth({
			authorization: routeAuthorization,
			getIdentity: () => identity,
		});
		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					router={createMockRouter()}
					overrides={{ media: mediaOverrides() }}
					auth={auth}
					initialIdentity={identity}
				>
					<LibraryPageComponent />
				</StackProvider>,
			);
		});
		await waitFor(() => hooks.useAssets.mock.calls.length > 0);

		expect(document.body.textContent).toContain("Beach.jpg");
	});
});

describe("Media library permissions", () => {
	it("keeps all write controls visible without an auth provider", async () => {
		await renderLibrary();

		expect(document.body.textContent).toContain("Upload");
		expect(container.querySelector('[title="New folder"]')).toBeTruthy();
		expect(container.querySelector('[title="Delete"]')).toBeTruthy();
	});

	it("hides asset and folder writes while leaving browsing available", async () => {
		const can = vi.fn(
			({ action }: { resource: string; action: string }) => action === "read",
		);
		await renderLibrary({
			auth: { getIdentity: () => ({ id: "viewer" }), can },
			router: createMockRouter("folder=folder-1"),
		});

		expect(document.body.textContent).toContain("Beach.jpg");
		expect(document.body.textContent).not.toContain("Upload");
		expect(container.querySelector('[title="New folder"]')).toBeNull();
		expect(container.querySelector('[title="Delete"]')).toBeNull();
		expect(document.body.textContent).not.toContain("Delete folder");
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "media:asset",
				action: "delete",
				params: { id: asset.id },
			}),
		);
	});

	it("uses exact schema-backed facts for one-rule asset and upload gates", async () => {
		const seen: Array<{ id: string; facts?: unknown }> = [];
		const definition = defineAuthorization({
			identity: z.object({
				id: z.string(),
				role: z.enum(["viewer", "editor"]),
			}),
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [
				media.library.read.allow(),
				media.asset.read.when(({ facts }) => {
					seen.push({ id: "read", facts });
					return (
						facts.assetId === asset.id && facts.mimeType === asset.mimeType
					);
				}),
				media.asset.upload.when(({ identity, facts }) => {
					seen.push({ id: "upload", facts });
					return identity?.role === "editor";
				}),
				media.asset.delete.when(() => false),
				media.folder.create.when(() => false),
				media.folder.delete.when(() => false),
			],
		});
		const clientAuth = createClientAuth({
			authorization: definition,
			getIdentity: () => ({ id: "viewer", role: "viewer" as const }),
		});
		await renderLibrary({
			auth: clientAuth,
			initialIdentity: { id: "viewer", role: "viewer" },
		});

		expect(document.body.textContent).toContain("Beach.jpg");
		expect(document.body.textContent).not.toContain("Upload");
		expect(seen).toContainEqual({
			id: "read",
			facts: {
				assetId: asset.id,
				mimeType: asset.mimeType,
			},
		});
		expect(seen).toContainEqual({
			id: "upload",
			facts: { phase: "direct" },
		});
	});
});

describe("Media library URL state", () => {
	it("seeds folder and search filters from the URL", async () => {
		const router = createMockRouter("folder=folder-1&q=beach");
		await renderLibrary({ router });

		const input = container.querySelector(
			"input[placeholder]",
		) as HTMLInputElement;
		expect(input.value).toBe("beach");
		expect(hooks.useAssets).toHaveBeenLastCalledWith({
			folderId: "folder-1",
			query: "beach",
			limit: 40,
		});
		expect(router.setSearchParams).not.toHaveBeenCalled();
	});

	it("pushes folder changes and replaces debounced search changes", async () => {
		const router = await renderLibrary();
		const photos = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Photos"),
		)!;

		await act(async () => {
			photos.click();
			await Promise.resolve();
		});
		let [params, options] = router.setSearchParams.mock.calls.at(-1)!;
		expect(params.get("folder")).toBe("folder-1");
		expect(options).toEqual({ replace: false });

		router.setSearchParams.mockClear();
		const input = container.querySelector(
			"input[placeholder]",
		) as HTMLInputElement;
		await act(async () => typeInto(input, "sunset"));
		expect(router.setSearchParams).not.toHaveBeenCalled();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 350));
		});
		[params, options] = router.setSearchParams.mock.calls.at(-1)!;
		expect(params.get("q")).toBe("sunset");
		expect(options).toEqual({ replace: true });
	});
});

describe("Media forms and i18n", () => {
	it("requires asset.read before selecting a URL-registered asset", async () => {
		const onSelect = vi.fn();
		const submit = vi.fn(async () => asset);
		hooks.useRegisterAssetForm.mockImplementation(
			(options: { onSuccess?: (created: SerializedAsset) => void }) => ({
				submit: vi.fn(async () => {
					const created = await submit();
					options.onSuccess?.(created);
					return created;
				}),
				isSubmitting: false,
				error: null,
				fieldErrors: {},
				clearErrors: vi.fn(),
			}),
		);
		const definition = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [
				media.library.read.allow(),
				media.asset.read.when(() => false),
				media.asset.upload.allow(),
			],
		});
		const auth = createClientAuth({
			authorization: definition,
			getIdentity: () => ({ id: "uploader" }),
		});

		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					api={{ baseURL: "http://test.local", basePath: "/api/data" }}
					router={createMockRouter()}
					overrides={{ media: mediaOverrides() }}
					auth={auth}
					initialIdentity={{ id: "uploader" }}
				>
					<MediaPicker
						trigger={<button type="button">Open</button>}
						onSelect={onSelect}
					/>
				</StackProvider>,
			);
		});
		await act(async () => {
			(container.querySelector("button") as HTMLButtonElement).click();
			await Promise.resolve();
		});
		const urlTab = Array.from(document.body.querySelectorAll("button")).find(
			(button) => button.textContent === "URL",
		) as HTMLButtonElement;
		await act(async () => {
			urlTab.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, button: 0 }),
			);
			urlTab.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		const input = document.body.querySelector(
			'[data-testid="media-url-input"]',
		) as HTMLInputElement;
		await act(async () => typeInto(input, asset.url));
		const useUrl = Array.from(document.body.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Use URL"),
		) as HTMLButtonElement;
		await act(async () => {
			useUrl.click();
			await Promise.resolve();
		});

		expect(submit).toHaveBeenCalledOnce();
		expect(onSelect).not.toHaveBeenCalled();
		expect(
			document.body.querySelector('[data-testid="media-select-button"]'),
		).toBeNull();
	});

	it("renders server URL field errors inline", async () => {
		hooks.useRegisterAssetForm.mockReturnValue({
			submit: vi.fn(),
			isSubmitting: false,
			error: new Error("Validation failed"),
			fieldErrors: { url: "URL is not allowed" },
			clearErrors: vi.fn(),
		});

		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					router={createMockRouter()}
					overrides={{ media: mediaOverrides() }}
				>
					<UrlTab folderId={null} onRegistered={vi.fn()} />
				</StackProvider>,
			);
		});

		expect(document.body.textContent).toContain("URL is not allowed");
	});

	it("routes library copy through the i18n provider", async () => {
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "media.actions.copyUrl" ? "URL kopieren" : defaultValue,
		};
		await renderLibrary({ i18n });

		expect(container.querySelector('[title="URL kopieren"]')).toBeTruthy();
	});
});
