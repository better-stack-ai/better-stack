import { createRequire } from "node:module";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { QueryClient } from "@tanstack/react-query";
import { blogBackendPlugin } from "../../plugin-blog/src/api/plugin";
import { cmsBackendPlugin } from "../../plugin-cms/src/api/plugin";
import { getAllContentItems } from "../../plugin-cms/src/api/getters";
import { searchBackendPlugin } from "../src/api/plugin";
import {
	blogSearchProvider,
	cmsSearchProvider,
	searchSnippet,
} from "../src/providers";
import type { BlogSearchOperations } from "../src/providers";
import type { SearchProvider, SearchProviderResult } from "../src/types";
import { z } from "zod";
import type { SearchResponse } from "../src/types";

const normalize = (s: string) =>
	s
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, "");
const sizes = (process.env.SEARCH_BENCH_SIZES ?? "100,1000")
	.split(",")
	.map(Number);
const repeats = Number(process.env.SEARCH_BENCH_REPEATS ?? 3);
const batchSize = process.env.SEARCH_BENCH_BATCH_SIZE === "100" ? 100 : 201;
const sourceCounts = (process.env.SEARCH_BENCH_SOURCES ?? "1,5,8")
	.split(",")
	.map(Number);
const runtime = process.env.SEARCH_BENCH_RUNTIME;
const requireRuntime = runtime
	? createRequire(resolve(runtime, "package.json"))
	: undefined;
if (runtime) {
	const url = new URL(process.env.SEARCH_BENCH_DATABASE_URL ?? "");
	if (
		!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
		url.pathname !== "/search_benchmark"
	) {
		throw new Error(
			"PostgreSQL benchmark requires a loopback search_benchmark database",
		);
	}
}
const request = new Request("http://localhost/api/search");
for (const size of sizes) {
	for (const sourceCount of sourceCounts) {
		const metrics = {
			providerCalls: 0,
			queries: 0,
			rows: 0,
			bytes: 0,
			sqlQueries: 0,
		};
		let measuring = false;
		const prisma = requireRuntime
			? new (requireRuntime("@prisma/client").PrismaClient)({
					datasources: { db: { url: process.env.SEARCH_BENCH_DATABASE_URL } },
					log: [{ emit: "event", level: "query" }],
				})
			: undefined;
		if (prisma) {
			prisma.$on("query", () => {
				if (measuring) metrics.sqlQueries++;
			});
			if (
				(await prisma.post.count()) ||
				(await prisma.contentItem.count()) ||
				(await prisma.contentType.count())
			) {
				throw new Error("PostgreSQL benchmark requires empty fixture tables");
			}
		}
		let stack: ReturnType<typeof createBackendStack>;
		const providers: SearchProvider[] = [
			blogSearchProvider({
				batchSize,
				operations: (req): BlogSearchOperations =>
					stack.forRequest(req).operations
						.blog as unknown as BlogSearchOperations,
			}),
		];
		for (let n = 1; n < sourceCount; n++) {
			providers.push(
				cmsSearchProvider({
					typeSlug: `compound-${n}`,
					label: "Compounds",
					async search({ q, limit }) {
						const query = normalize(q);
						if (!query) return { items: [], hasMore: false };
						const matches: SearchProviderResult[] = [];
						let offset = 0;
						while (matches.length <= limit) {
							const page = await getAllContentItems(
								stack.adapter,
								`compound-${n}`,
								{
									view: "content",
									fields: ["name", "aliases", "overview"],
									offset,
									limit: 100,
								},
							);
							for (const item of page.items) {
								const data = item.parsedData;
								if (
									![item.slug, data.name, data.aliases, data.overview].some(
										(v) =>
											typeof v === "string" && normalize(v).includes(query),
									)
								)
									continue;
								matches.push({
									resourceId: item.id,
									title: String(data.name),
									aliases: [String(data.aliases)],
									snippet: searchSnippet(
										String(data.aliases) + " " + String(data.overview),
									),
									href: `/compounds/${item.slug}`,
								});
								if (matches.length > limit) break;
							}
							offset += page.items.length;
							if (offset >= page.total || !page.items.length) break;
						}
						return {
							items: matches.slice(0, limit),
							hasMore: matches.length > limit,
						};
					},
				}),
			);
		}
		for (const provider of providers) {
			const search = provider.search;
			provider.search = async (context) => {
				if (measuring) metrics.providerCalls++;
				return search(context);
			};
		}
		stack = createBackendStack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin(),
				cms: cmsBackendPlugin({
					contentTypes: Array.from({ length: sourceCount - 1 }, (_, n) => ({
						slug: `compound-${n + 1}`,
						name: "Compound",
						schema: z.object({
							name: z.string(),
							aliases: z.string(),
							overview: z.string(),
						}),
					})),
				}),
				search: searchBackendPlugin({ providers }),
			},
			adapter: (db) => {
				const adapter = prisma
					? requireRuntime!("@btst/adapter-prisma").createPrismaAdapter(
							prisma,
							db,
							{ provider: "postgresql" },
						)({})
					: createMemoryAdapter(db)({});
				for (const method of ["findOne", "findMany", "count"] as const) {
					const original = adapter[method];
					Object.defineProperty(adapter, method, {
						value: new Proxy(original, {
							async apply(target, thisArg, args) {
								const result = await Reflect.apply(target, thisArg, args);
								if (measuring) {
									metrics.queries++;
									metrics.rows += Array.isArray(result)
										? result.length
										: result && typeof result === "object"
											? 1
											: 0;
									metrics.bytes += Buffer.byteLength(JSON.stringify(result));
								}
								return result;
							},
						}),
						configurable: true,
					});
				}
				return adapter;
			},
		});
		// Seed through adapter to keep fixture IDs/dates stable and exclude mutation cost.
		for (let i = 0; i < size; i++) {
			const id = String(i).padStart(6, "0");
			await stack.adapter.create({
				model: "post",
				forceAllowId: true,
				data: {
					id,
					title: i === size - 1 ? "Masteron" : `Research guide ${id}`,
					slug: `guide-${id}`,
					content: "Research " + "x".repeat(2048),
					excerpt: "Public guide",
					published: i % 10 !== 0,
					createdAt: new Date(1700000000000 + i),
					updatedAt: new Date(1700000000000 + i),
				},
			});
		}
		for (let n = 1; n < sourceCount; n++) {
			const type = await stack.adapter.create<{ id: string }>({
				model: "contentType",
				forceAllowId: true,
				data: {
					id: `type-${n}`,
					name: "Compound",
					slug: `compound-${n}`,
					jsonSchema: JSON.stringify({
						type: "object",
						properties: {
							name: { type: "string" },
							aliases: { type: "string" },
							overview: { type: "string" },
						},
					}),
					autoFormVersion: 2,
					createdAt: new Date(1700000000000),
					updatedAt: new Date(1700000000000),
				},
			});
			for (let i = 0; i < size; i++) {
				const id = `${n}-${String(i).padStart(6, "0")}`;
				await stack.adapter.create({
					model: "contentItem",
					forceAllowId: true,
					data: {
						id,
						contentTypeId: type.id,
						slug: id,
						data: JSON.stringify({
							name: i === size - 1 ? "Masteron" : `Compound ${id}`,
							aliases: "drostanolone",
							overview: "Masteron " + "x".repeat(2048),
						}),
						createdAt: new Date(1700000000000 + i),
						updatedAt: new Date(1700000000000 + i),
					},
				});
			}
		}
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: Infinity } },
		});
		for (const [scenario, input] of Object.entries({
			exact: { q: "Masteron" },
			prefix: { q: "Mast" },
			alias: { q: "dro-stanolone" },
			broad: { q: "Research" },
			none: { q: "no-such-record" },
			literal: { q: "\u0000" },
			later: { q: "Masteron", page: 5 },
			scoped: { q: "Masteron", sources: ["blog"] },
		})) {
			for (const cache of ["cold", "repeat"]) {
				const durations: number[] = [];
				// Drain Prisma query events outside the timed request interval.
				if (prisma) await new Promise((resolve) => setTimeout(resolve, 20));
				Object.assign(metrics, {
					providerCalls: 0,
					queries: 0,
					rows: 0,
					bytes: 0,
					sqlQueries: 0,
				});
				let titles: string[] = [];
				measuring = true;
				for (let run = 0; run < repeats; run++) {
					const key = [size, sourceCount, scenario, run];
					if (cache === "cold") client.removeQueries({ queryKey: key });
					const start = performance.now();
					const result: SearchResponse = await client.fetchQuery({
						queryKey: key,
						queryFn: () =>
							stack.forRequest(request).operations.search.search(input),
					});
					durations.push(performance.now() - start);
					titles = result.items.slice(0, 3).map((item) => item.title);
				}
				if (prisma) await new Promise((resolve) => setTimeout(resolve, 20));
				measuring = false;
				durations.sort((a, b) => a - b);
				console.log(
					JSON.stringify({
						size,
						sourceCount,
						scenario,
						cache,
						repeats,
						...metrics,
						p50Ms: +durations[Math.floor(durations.length / 2)]!.toFixed(3),
						p95Ms:
							+durations[Math.ceil(durations.length * 0.95) - 1]!.toFixed(3),
						titles,
					}),
				);
			}
		}
		client.clear();
		if (prisma) {
			await prisma.post.deleteMany();
			await prisma.contentType.deleteMany();
			await prisma.$disconnect();
		}
	}
}
