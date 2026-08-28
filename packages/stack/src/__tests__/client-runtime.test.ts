import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import { createRoute } from "@btst/yar";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../client";
import {
	defineClientPlugin,
	type ResolvedClientPluginRuntime,
} from "../plugins/client";

function headersRecord(headers: HeadersInit | undefined) {
	return Object.fromEntries(new Headers(headers).entries());
}

function createProbePlugin(
	onResolve: (runtime: ResolvedClientPluginRuntime) => void,
) {
	return defineClientPlugin({
		name: "probe",
		resolve(runtime) {
			onResolve(runtime);
			return {
				routes: () => ({
					probe: createRoute("/probe", () => ({
						PageComponent: () => null,
						loader: async () => {
							await runtime.queryClient.prefetchQuery({
								queryKey: ["probe"],
								queryFn: async () =>
									`${runtime.api.baseURL}${runtime.api.basePath}`,
							});
						},
						meta: () => [
							{
								name: "probe-site",
								content: `${runtime.site.baseURL}${runtime.site.basePath}`,
							},
						],
					})),
				}),
				sitemap: () => [
					{
						url: `${runtime.site.baseURL}${runtime.site.basePath}/probe`,
					},
				],
			};
		},
	});
}

describe("resolved client runtime", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("drives loaders, metadata, sitemap and provider projection from one runtime", async () => {
		const queryClient = new QueryClient();
		let runtime: ResolvedClientPluginRuntime | undefined;
		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com/",
				basePath: "api/data/",
				headers: { cookie: "session=server" },
			},
			site: {
				baseURL: "https://app.example.com/",
				basePath: "pages/",
			},
			queryClient,
			plugins: {
				probe: createProbePlugin((value) => {
					runtime = value;
				}),
			},
		});

		const route = stack.router.getRoute("/probe");
		await route?.loader?.();

		expect(runtime).toMatchObject({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
		});
		expect(runtime?.queryClient).toBe(queryClient);
		expect(headersRecord(runtime?.api.headers)).toEqual({
			cookie: "session=server",
		});
		expect(queryClient.getQueryData(["probe"])).toBe(
			"https://app.example.com/api/data",
		);
		expect(route?.meta?.()).toEqual([
			{
				name: "probe-site",
				content: "https://app.example.com/pages",
			},
		]);
		await expect(stack.generateSitemap()).resolves.toEqual([
			{ url: "https://app.example.com/pages/probe" },
		]);

		expect(stack.provider.queryClient).toBe(queryClient);
		expect(stack.provider.api).toEqual({
			baseURL: "https://app.example.com",
			basePath: "/api/data",
		});
		expect(stack.provider.site).toEqual({
			baseURL: "https://app.example.com",
			basePath: "/pages",
		});
		expect(stack.provider.plugins.probe).toEqual({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
		});
		expect("headers" in stack.provider.api).toBe(false);
		expect(JSON.stringify(stack.provider)).not.toContain("session=server");
	});

	it("keeps request headers for a same-origin path replacement but not its browser projection", () => {
		let runtime: ResolvedClientPluginRuntime | undefined;
		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-secret",
					cookie: "session=server",
					"x-request-id": "request-1",
				},
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: new QueryClient(),
			plugins: {
				probe: createProbePlugin((value) => {
					runtime = value;
				}),
			},
			endpoints: {
				probe: {
					api: {
						basePath: "/api/probe",
						headers: { "x-public-client": "browser-safe" },
					},
				},
			},
		});

		expect(runtime?.api.baseURL).toBe("https://app.example.com");
		expect(runtime?.api.basePath).toBe("/api/probe");
		expect(headersRecord(runtime?.api.headers)).toEqual({
			authorization: "Bearer server-secret",
			cookie: "session=server",
			"x-public-client": "browser-safe",
			"x-request-id": "request-1",
		});
		expect(headersRecord(stack.provider.plugins.probe.api.headers)).toEqual({
			"x-public-client": "browser-safe",
		});
		expect(JSON.stringify(stack.provider)).not.toContain("server-secret");
		expect(JSON.stringify(stack.provider)).not.toContain("session=server");
	});

	it("strips inherited credentials at a cross-origin boundary and keeps only explicit browser transport", () => {
		let runtime: ResolvedClientPluginRuntime | undefined;
		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-secret",
					cookie: "session=server",
					"x-request-id": "request-1",
				},
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: new QueryClient(),
			plugins: {
				probe: createProbePlugin((value) => {
					runtime = value;
				}),
			},
			endpoints: {
				probe: {
					api: {
						baseURL: "https://plugins.example.net",
						basePath: "/btst/probe",
						headers: { "x-public-client": "browser-safe" },
						credentials: "include",
					},
					site: {
						baseURL: "https://pages.example.net",
						basePath: "/features",
					},
				},
			},
		});

		expect(runtime?.api).toMatchObject({
			baseURL: "https://plugins.example.net",
			basePath: "/btst/probe",
			credentials: "include",
		});
		expect(headersRecord(runtime?.api.headers)).toEqual({
			"x-public-client": "browser-safe",
		});
		expect(runtime?.site).toEqual({
			baseURL: "https://pages.example.net",
			basePath: "/features",
		});
		expect(stack.provider.plugins.probe).toEqual({
			api: {
				baseURL: "https://plugins.example.net",
				basePath: "/btst/probe",
				headers: new Headers({ "x-public-client": "browser-safe" }),
				credentials: "include",
			},
			site: {
				baseURL: "https://pages.example.net",
				basePath: "/features",
			},
		});
		expect(JSON.stringify(stack.provider)).not.toContain("server-secret");
		expect(JSON.stringify(stack.provider)).not.toContain("session=server");

		let browserRuntime: ResolvedClientPluginRuntime | undefined;
		vi.stubGlobal("window", {});
		const browserStack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: new QueryClient(),
			plugins: {
				probe: createProbePlugin((value) => {
					browserRuntime = value;
				}),
			},
			endpoints: {
				probe: {
					api: {
						baseURL: "https://plugins.example.net",
						basePath: "/btst/probe",
						headers: { "x-public-client": "browser-safe" },
						credentials: "include",
					},
					site: {
						baseURL: "https://pages.example.net",
						basePath: "/features",
					},
				},
			},
		});

		expect(browserRuntime?.api.baseURL).toBe(runtime?.api.baseURL);
		expect(browserRuntime?.api.basePath).toBe(runtime?.api.basePath);
		expect(browserRuntime?.api.credentials).toBe(runtime?.api.credentials);
		expect(headersRecord(browserRuntime?.api.headers)).toEqual(
			headersRecord(runtime?.api.headers),
		);
		expect(browserStack.provider.plugins.probe).toEqual(
			stack.provider.plugins.probe,
		);
	});

	it("hydrates browser reads and runs mutations and invalidation through its one query client", async () => {
		const serverQueryClient = new QueryClient();
		const serverStack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: { cookie: "session=server" },
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: serverQueryClient,
			plugins: { probe: createProbePlugin(() => undefined) },
			endpoints: {
				probe: { api: { basePath: "/api/probe" } },
			},
		});
		await serverStack.router.getRoute("/probe")?.loader?.();
		await serverStack.provider.queryClient.prefetchQuery({
			queryKey: ["probe-ssg"],
			queryFn: async () =>
				`${serverStack.provider.plugins.probe.api.baseURL}${serverStack.provider.plugins.probe.api.basePath}`,
		});
		const dehydrated = dehydrate(serverQueryClient);

		vi.stubGlobal("window", {});
		const browserQueryClient = new QueryClient();
		const browserStack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: browserQueryClient,
			plugins: { probe: createProbePlugin(() => undefined) },
			endpoints: {
				probe: { api: { basePath: "/api/probe" } },
			},
		});
		hydrate(browserStack.provider.queryClient, dehydrated);

		const browserFetch = vi.fn(async () => "unexpected refetch");
		await expect(
			browserStack.provider.queryClient.fetchQuery({
				queryKey: ["probe"],
				queryFn: browserFetch,
				staleTime: Number.POSITIVE_INFINITY,
			}),
		).resolves.toBe("https://app.example.com/api/probe");
		expect(browserFetch).not.toHaveBeenCalled();
		const browserSsgFetch = vi.fn(async () => "unexpected SSG refetch");
		await expect(
			browserStack.provider.queryClient.fetchQuery({
				queryKey: ["probe-ssg"],
				queryFn: browserSsgFetch,
				staleTime: Number.POSITIVE_INFINITY,
			}),
		).resolves.toBe("https://app.example.com/api/probe");
		expect(browserSsgFetch).not.toHaveBeenCalled();

		const invalidate = vi.spyOn(browserQueryClient, "invalidateQueries");
		const mutationTransport = vi.fn(async () => {
			const { baseURL, basePath } = browserStack.provider.plugins.probe.api;
			return `${baseURL}${basePath}/mutate`;
		});
		const mutation = browserStack.provider.queryClient
			.getMutationCache()
			.build(browserStack.provider.queryClient, {
				mutationFn: mutationTransport,
				onSuccess: async (result) => {
					browserStack.provider.queryClient.setQueryData(["probe"], result);
					await browserStack.provider.queryClient.invalidateQueries({
						queryKey: ["probe"],
					});
				},
			});
		await expect(mutation.execute(undefined)).resolves.toBe(
			"https://app.example.com/api/probe/mutate",
		);
		expect(mutationTransport).toHaveBeenCalledOnce();
		expect(browserQueryClient.getQueryData(["probe"])).toBe(
			"https://app.example.com/api/probe/mutate",
		);
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ["probe"],
		});
		expect(browserStack.provider.queryClient).toBe(browserQueryClient);
	});

	it("uses the same endpoint and query client in separately created SSR and browser stacks", async () => {
		const serverQueryClient = new QueryClient();
		const browserQueryClient = new QueryClient();
		let serverRuntime: ResolvedClientPluginRuntime | undefined;
		let browserRuntime: ResolvedClientPluginRuntime | undefined;

		const shared = {
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			endpoints: {
				probe: {
					api: {
						basePath: "/api/probe",
						headers: { "x-public-client": "browser-safe" },
					},
				},
			},
		} as const;

		const serverStack = createClientStack({
			...shared,
			api: { ...shared.api, headers: { cookie: "session=server" } },
			queryClient: serverQueryClient,
			plugins: {
				probe: createProbePlugin((value) => {
					serverRuntime = value;
				}),
			},
		});
		await serverStack.router.getRoute("/probe")?.loader?.();

		vi.stubGlobal("window", {});
		const browserStack = createClientStack({
			...shared,
			queryClient: browserQueryClient,
			plugins: {
				probe: createProbePlugin((value) => {
					browserRuntime = value;
				}),
			},
		});
		await browserStack.router.getRoute("/probe")?.loader?.();

		expect(serverRuntime?.api.baseURL).toBe(browserRuntime?.api.baseURL);
		expect(serverRuntime?.api.basePath).toBe(browserRuntime?.api.basePath);
		expect(serverRuntime?.site).toEqual(browserRuntime?.site);
		expect(serverRuntime?.queryClient).toBe(serverQueryClient);
		expect(browserRuntime?.queryClient).toBe(browserQueryClient);
		expect(browserStack.provider.queryClient).toBe(browserQueryClient);
		expect(headersRecord(browserRuntime?.api.headers)).toEqual({
			"x-public-client": "browser-safe",
		});
		expect(browserStack.provider.plugins.probe.api).toEqual(
			serverStack.provider.plugins.probe.api,
		);
	});

	it("rejects request headers on a browser-created stack", () => {
		vi.stubGlobal("window", {});
		expect(() =>
			createClientStack({
				api: {
					baseURL: "https://app.example.com",
					basePath: "/api/data",
					headers: { authorization: "Bearer server-secret" },
				},
				site: {
					baseURL: "https://app.example.com",
					basePath: "/pages",
				},
				queryClient: new QueryClient(),
				plugins: {
					probe: createProbePlugin(() => undefined),
				},
			}),
		).toThrowError(/request headers.*server/i);
	});

	it("fails invalid and incomplete endpoint replacements with actionable diagnostics", () => {
		const baseConfig = {
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: new QueryClient(),
			plugins: {
				probe: createProbePlugin(() => undefined),
			},
		};

		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: {
					probe: {
						api: { baseURL: "https://plugins.example.net" },
					},
				} as any,
			}),
		).toThrowError(/probe.*basePath/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				api: { baseURL: "/relative", basePath: "/api/data" },
			}),
		).toThrowError(/api\.baseURL.*absolute/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: { missing: { api: { basePath: "/api/missing" } } } as any,
			}),
		).toThrowError(/missing.*registered client plugin/i);
	});

	it("keeps legacy client plugins working during first-party migration", async () => {
		const legacy = defineClientPlugin({
			name: "legacy",
			routes: () => ({
				legacy: createRoute("/legacy", () => ({
					PageComponent: () => null,
				})),
			}),
			sitemap: () => [{ url: "https://legacy.example.com/legacy" }],
		});
		const stack = createClientStack({ plugins: { legacy } });

		expect(stack.router.getRoute("/legacy")).toBeTruthy();
		await expect(stack.generateSitemap()).resolves.toEqual([
			{ url: "https://legacy.example.com/legacy" },
		]);
	});

	it("keeps definition and request stack modules server-import-safe", async () => {
		await expect(import("../plugins/client")).resolves.toHaveProperty(
			"defineClientPlugin",
		);
		await expect(import("../client")).resolves.toHaveProperty(
			"createClientStack",
		);
		const clientEntrySource = await readFile(
			new URL("../client/index.ts", import.meta.url),
			"utf8",
		);
		expect(clientEntrySource).not.toContain('"use client"');
		expect(clientEntrySource).not.toContain('from "react"');

		let runtime: ResolvedClientPluginRuntime | undefined;
		createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: { cookie: "session=request" },
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient: new QueryClient(),
			plugins: {
				probe: createProbePlugin((value) => {
					runtime = value;
				}),
			},
		});
		expect(headersRecord(runtime?.api.headers)).toEqual({
			cookie: "session=request",
		});
	});
});
