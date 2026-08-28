import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import { createRoute } from "@btst/yar";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack, type ResolvedClientStack } from "../client";
import {
	createResourceQueryKeys,
	defineClientPlugin,
	runResourceMutation,
	type ResourceClient,
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

const probeResources = {
	probe: {
		queries: {
			detail: { path: "/probe", select: (data: any) => data.url as string },
			ssg: { path: "/probe/ssg", select: (data: any) => data.url as string },
			live: { path: "/probe/live", select: (data: any) => data.url as string },
		},
		mutations: {
			update: {
				path: "/probe",
				method: "PATCH" as const,
				input: (value: string) => ({ body: { value } }),
				select: (data: any) => data.url as string,
			},
		},
	},
} as const;

function createProbeResourceSeam(runtime: ResolvedClientPluginRuntime) {
	const calls: Array<{
		path: string;
		method: string;
		headers: Record<string, string>;
	}> = [];
	const client: ResourceClient = async (path, options) => {
		calls.push({
			path,
			method: options?.method ?? "GET",
			headers: headersRecord(options?.headers),
		});
		return {
			data: {
				url: `${runtime.api.baseURL}${runtime.api.basePath}${path}`,
			},
		};
	};
	const queryKeys = createResourceQueryKeys(
		client,
		probeResources,
		runtime.api.headers,
	);
	return {
		calls,
		queryKeys,
		runtime,
		mutate: (value: string) =>
			runResourceMutation(
				client,
				probeResources.probe.mutations.update,
				value,
				runtime.api.headers,
			) as Promise<string>,
	};
}

type ProbeResourceSeam = ReturnType<typeof createProbeResourceSeam>;

function createResourceProbePlugin(
	onResolve: (seam: ProbeResourceSeam) => void,
) {
	return defineClientPlugin({
		name: "probeResource",
		resolve(runtime) {
			const seam = createProbeResourceSeam(runtime);
			onResolve(seam);
			return {
				routes: () => ({
					probe: createRoute("/probe", () => ({
						PageComponent: () => null,
						loader: () =>
							runtime.queryClient.prefetchQuery(seam.queryKeys.probe.detail()),
					})),
				}),
			};
		},
	});
}

function withObjectPrototypePollution<T>(
	properties: Record<string, unknown>,
	run: () => T,
): T {
	const originals = new Map<string, PropertyDescriptor | undefined>();
	for (const key of Object.keys(properties)) {
		originals.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
	}

	try {
		for (const [key, value] of Object.entries(properties)) {
			Object.defineProperty(Object.prototype, key, {
				configurable: true,
				writable: true,
				value,
			});
		}
		return run();
	} finally {
		for (const [key, descriptor] of originals) {
			if (descriptor) {
				Object.defineProperty(Object.prototype, key, descriptor);
			} else {
				Reflect.deleteProperty(Object.prototype, key);
			}
		}
	}
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
						browserHeaders: { "x-public-client": "browser-safe" },
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
		expect(
			headersRecord(stack.provider.plugins.probe.api.browserHeaders),
		).toEqual({
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
						browserHeaders: { "x-public-client": "browser-safe" },
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
				browserHeaders: new Headers({ "x-public-client": "browser-safe" }),
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
						browserHeaders: { "x-public-client": "browser-safe" },
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
		let serverResource: ProbeResourceSeam | undefined;
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
			plugins: {
				probe: createResourceProbePlugin((seam) => {
					serverResource = seam;
				}),
			},
			endpoints: {
				probe: { api: { basePath: "/api/probe" } },
			},
		});
		await serverStack.router.getRoute("/probe")?.loader?.();
		expect(serverResource).toBeDefined();
		await serverStack.provider.queryClient.prefetchQuery({
			...serverResource!.queryKeys.probe.ssg(),
		});
		expect(serverResource?.calls).toEqual([
			{
				path: "/probe",
				method: "GET",
				headers: { cookie: "session=server" },
			},
			{
				path: "/probe/ssg",
				method: "GET",
				headers: { cookie: "session=server" },
			},
		]);
		const dehydrated = dehydrate(serverQueryClient);

		vi.stubGlobal("window", {});
		const browserQueryClient = new QueryClient();
		let browserResource: ProbeResourceSeam | undefined;
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
			plugins: {
				probe: createResourceProbePlugin((seam) => {
					browserResource = seam;
				}),
			},
			endpoints: {
				probe: { api: { basePath: "/api/probe" } },
			},
		});
		hydrate(browserStack.provider.queryClient, dehydrated);
		expect(browserResource).toBeDefined();

		await expect(
			browserStack.provider.queryClient.fetchQuery({
				...browserResource!.queryKeys.probe.detail(),
				staleTime: Number.POSITIVE_INFINITY,
			}),
		).resolves.toBe("https://app.example.com/api/probe/probe");
		await expect(
			browserStack.provider.queryClient.fetchQuery({
				...browserResource!.queryKeys.probe.ssg(),
				staleTime: Number.POSITIVE_INFINITY,
			}),
		).resolves.toBe("https://app.example.com/api/probe/probe/ssg");
		expect(browserResource?.calls).toEqual([]);
		await expect(
			browserStack.provider.queryClient.fetchQuery(
				browserResource!.queryKeys.probe.live(),
			),
		).resolves.toBe("https://app.example.com/api/probe/probe/live");
		expect(browserResource?.calls).toEqual([
			{ path: "/probe/live", method: "GET", headers: {} },
		]);

		const invalidate = vi.spyOn(browserQueryClient, "invalidateQueries");
		const mutation = browserStack.provider.queryClient
			.getMutationCache()
			.build(browserStack.provider.queryClient, {
				mutationFn: () => browserResource!.mutate("updated"),
				onSuccess: async (result) => {
					browserStack.provider.queryClient.setQueryData(
						browserResource!.queryKeys.probe.detail().queryKey,
						result,
					);
					await browserStack.provider.queryClient.invalidateQueries({
						queryKey: browserResource!.queryKeys.probe._def,
					});
				},
			});
		await expect(mutation.execute(undefined)).resolves.toBe(
			"https://app.example.com/api/probe/probe",
		);
		expect(browserResource?.calls.at(-1)).toEqual({
			path: "/probe",
			method: "PATCH",
			headers: {},
		});
		expect(
			browserQueryClient.getQueryData(
				browserResource!.queryKeys.probe.detail().queryKey,
			),
		).toBe("https://app.example.com/api/probe/probe");
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: browserResource!.queryKeys.probe._def,
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
						browserHeaders: { "x-public-client": "browser-safe" },
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
				api: {
					baseURL: "https://app.example.com",
					basePath: "https://plugins.example.net/api",
				},
			}),
		).toThrowError(/api\.basePath.*path without an origin/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: { missing: { api: { basePath: "/api/missing" } } } as any,
			}),
		).toThrowError(/missing.*registered client plugin/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: null,
			} as any),
		).toThrowError(/endpoints.*plugin endpoint map/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: new Date(),
			} as any),
		).toThrowError(/endpoints.*plugin endpoint map/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				plugins: new Date(),
			} as any),
		).toThrowError(/plugins.*registration map/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: { probe: [] } as any,
			}),
		).toThrowError(/probe.*object/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: { probe: { api: new Date() } } as any,
			}),
		).toThrowError(/probe\.api.*endpoint object/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: { probe: { api: false } } as any,
			}),
		).toThrowError(/probe\.api.*endpoint object/i);
		expect(() =>
			createClientStack({
				...baseConfig,
				endpoints: {
					probe: {
						api: {
							basePath: "/api/probe",
							credentials: "server-secret",
						},
					},
				} as any,
			}),
		).toThrowError(/probe\.api\.credentials.*omit.*same-origin.*include/i);
		for (const sensitiveHeader of ["authorization", "cookie"]) {
			expect(() =>
				createClientStack({
					...baseConfig,
					endpoints: {
						probe: {
							api: {
								basePath: "/api/probe",
								browserHeaders: { [sensitiveHeader]: "server-secret" },
							},
						},
					},
				}),
			).toThrowError(
				new RegExp(`browserHeaders.*sensitive header.*${sensitiveHeader}`, "i"),
			);
		}

		const inherited = createClientStack({
			...baseConfig,
			endpoints: { probe: {} },
		});
		expect(inherited.provider.plugins.probe).toEqual({
			api: baseConfig.api,
			site: baseConfig.site,
		});
	});

	it("preserves computed prototype-like plugin and route keys as own entries", () => {
		let contextOwnsPlugin = false;
		let runtime: ResolvedClientPluginRuntime | undefined;
		const prototypePlugin = defineClientPlugin({
			name: "prototypePlugin",
			resolve(value) {
				runtime = value;
				return {
					routes: (context) => {
						contextOwnsPlugin = Object.hasOwn(
							context?.plugins ?? {},
							"__proto__",
						);
						return {
							["__proto__"]: createRoute("/prototype", () => ({
								PageComponent: () => null,
							})),
						};
					},
				};
			},
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { ["__proto__"]: prototypePlugin },
			endpoints: {
				["__proto__"]: { api: { basePath: "/api/prototype" } },
			},
		});

		expect(runtime?.api.basePath).toBe("/api/prototype");
		expect(contextOwnsPlugin).toBe(true);
		expect(Object.getPrototypeOf(stack.provider.plugins)).toBeNull();
		expect(Object.hasOwn(stack.provider.plugins, "__proto__")).toBe(true);
		expect(stack.router.getRoute("/prototype")).toBeTruthy();
	});

	it("rejects inherited object names as unregistered endpoint keys", () => {
		for (const inheritedName of ["__proto__", "constructor", "toString"]) {
			expect(() =>
				createClientStack({
					api: {
						baseURL: "https://app.example.com",
						basePath: "/api/data",
					},
					site: {
						baseURL: "https://app.example.com",
						basePath: "/pages",
					},
					queryClient: new QueryClient(),
					plugins: { probe: createProbePlugin(() => undefined) },
					endpoints: {
						[inheritedName]: { api: { basePath: "/api/inherited" } },
					} as any,
				}),
			).toThrowError(
				new RegExp(`${inheritedName}.*registered client plugin`, "i"),
			);
		}
	});

	it("inherits defaults for registered prototype-like keys omitted from endpoints", () => {
		for (const registeredName of ["__proto__", "constructor", "toString"]) {
			let runtime: ResolvedClientPluginRuntime | undefined;
			const stack = createClientStack({
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
					[registeredName]: createProbePlugin((value) => {
						runtime = value;
					}),
				},
				endpoints: {},
			});

			expect(runtime?.api.basePath).toBe("/api/data");
			expect(Object.hasOwn(stack.provider.plugins, registeredName)).toBe(true);
		}
	});

	it("ignores inherited runtime and plugin-definition discriminator fields", () => {
		const legacyPlugin = Object.assign(
			Object.create({
				resolve: () => {
					throw new Error("inherited resolve must not run");
				},
			}),
			{
				name: "legacyWithPrototype",
				routes: () => ({
					legacyWithPrototype: createRoute("/legacy-with-prototype", () => ({
						PageComponent: () => null,
					})),
				}),
			},
		);
		const inheritedCanonicalRuntime = {
			api: { baseURL: "https://inherited.example.com", basePath: "/api" },
			site: { baseURL: "https://inherited.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
		};
		const legacyConfig = Object.assign(
			Object.create(inheritedCanonicalRuntime),
			{ plugins: { legacyWithPrototype: legacyPlugin } },
		);

		const stack = createClientStack(legacyConfig as any);

		expect(stack.router.getRoute("/legacy-with-prototype")).toBeTruthy();
		expect("provider" in stack).toBe(false);
	});

	it("ignores prototype-polluted transport and nested endpoint fields", () => {
		const queryClient = new QueryClient();
		const runtimes: ResolvedClientPluginRuntime[] = [];
		const baseConfig = {
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			},
			site: {
				baseURL: "https://app.example.com",
				basePath: "/pages",
			},
			queryClient,
			plugins: {
				probe: createProbePlugin((runtime) => runtimes.push(runtime)),
			},
		};
		const assertSafeWhilePolluted = (
			stack: ResolvedClientStack<any, any>,
			runtime: ResolvedClientPluginRuntime,
		) => {
			const providerPlugin = stack.provider.plugins.probe!;
			expect(runtime.api.headers).toBeUndefined();
			expect(runtime.api.credentials).toBeUndefined();
			expect((stack.provider.api as any).headers).toBeUndefined();
			expect((stack.provider.api as any).browserHeaders).toBeUndefined();
			expect((stack.provider.api as any).credentials).toBeUndefined();
			expect(providerPlugin.api.browserHeaders).toBeUndefined();
			expect(providerPlugin.api.credentials).toBeUndefined();
			for (const exposed of [
				runtime,
				runtime.api,
				runtime.site,
				stack.provider,
				stack.provider.api,
				stack.provider.site,
				stack.provider.plugins,
				providerPlugin,
				providerPlugin.api,
				providerPlugin.site,
			]) {
				expect(Object.getPrototypeOf(exposed)).toBeNull();
			}
		};

		const inheritedTransportStack = withObjectPrototypePollution(
			{
				headers: { authorization: "Bearer prototype-secret" },
				endpoints: {
					probe: { api: { basePath: "/prototype-api" } },
				},
				browserHeaders: { "x-prototype": "unsafe" },
				credentials: "include",
			},
			() => {
				const stack = createClientStack(baseConfig);
				assertSafeWhilePolluted(stack, runtimes.at(-1)!);
				return stack;
			},
		);

		const inheritedNestedStack = withObjectPrototypePollution(
			{
				api: { basePath: "/prototype-api" },
				site: { basePath: "/prototype-pages" },
				browserHeaders: { "x-prototype": "unsafe" },
				credentials: "include",
			},
			() => {
				const stack = createClientStack({
					...baseConfig,
					endpoints: { probe: {} },
				});
				assertSafeWhilePolluted(stack, runtimes.at(-1)!);
				return stack;
			},
		);

		for (const runtime of runtimes) {
			expect(runtime.api).toMatchObject(baseConfig.api);
			expect(runtime.site).toEqual(baseConfig.site);
			expect(headersRecord(runtime.api.headers)).toEqual({});
			expect(Object.hasOwn(runtime.api, "credentials")).toBe(false);
		}
		for (const stack of [inheritedTransportStack, inheritedNestedStack]) {
			expect(stack.provider.plugins.probe.api).toMatchObject(baseConfig.api);
			expect(stack.provider.plugins.probe.site).toEqual(baseConfig.site);
			expect(
				Object.hasOwn(stack.provider.plugins.probe.api, "browserHeaders"),
			).toBe(false);
			expect(
				Object.hasOwn(stack.provider.plugins.probe.api, "credentials"),
			).toBe(false);
		}
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
