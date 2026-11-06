import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { createFlagCache } from "../api/cache";
import type { FeatureFlagsBackendOptions } from "../api/operations";
import { featureFlagsBackendPlugin } from "../api/plugin";
import { evaluateFlag, evaluateFlagVariant } from "../evaluate";
import { featureFlagsPermissions } from "../permissions";
import { createFlagSchema, updateFlagSchema } from "../schemas";
import type { FeatureFlag, FlagRecord } from "../types";

function setup(options: FeatureFlagsBackendOptions = {}, role = "anonymous") {
	let adapter!: DBAdapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.string() }),
		permissions: [featureFlagsPermissions],
		rules: ({ featureFlags }) => [
			featureFlags.flags.read.when(
				({ identity }) => identity?.role === "admin",
			),
			featureFlags.flags.create.when(
				({ identity }) => identity?.role === "admin",
			),
			featureFlags.flags.update.when(
				({ identity }) =>
					identity?.role === "admin" || identity?.role === "editor",
			),
			featureFlags.flags.toggle.when(
				({ identity }) => identity?.role === "admin",
			),
			featureFlags.flags.archive.when(
				({ identity }) => identity?.role === "admin",
			),
			featureFlags.evaluations.read.when(
				({ identity }) => identity?.role === "admin",
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({
			authorization,
			getIdentity: () => (role === "anonymous" ? null : { id: "user-1", role }),
		}),
		plugins: { featureFlags: featureFlagsBackendPlugin(options) },
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return {
		stack,
		adapter: () => adapter,
		operations: stack.trusted.featureFlags,
	};
}
function request(path: string, method = "GET", body?: unknown) {
	return new Request(`https://test.local/api/feature-flags/${path}`, {
		method,
		headers: { "content-type": "application/json" },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}
const definition: FeatureFlag = {
	id: "id",
	key: "checkout",
	name: "Checkout",
	description: null,
	type: "boolean",
	enabled: true,
	rolloutPct: null,
	segments: [],
	variants: [],
	tags: [],
	archivedAt: null,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};
afterEach(() => vi.useRealTimers());

describe("feature flag evaluation", () => {
	it("assigns weighted variants deterministically with independent rollout buckets and stable identity precedence", () => {
		const flag = {
			...definition,
			variants: [
				{ key: "control", weight: 30, payload: false },
				{
					key: "treatment",
					weight: 70,
					payload: { nested: { color: "blue" } },
				},
				{ key: "never", weight: 0 },
			],
		};
		const contexts = Array.from({ length: 5000 }, (_, i) => ({
			userId: `user-${i}`,
		}));
		const assignments = contexts.map((context) =>
			evaluateFlagVariant(flag, context),
		);
		expect(
			contexts.map((context) => evaluateFlagVariant(flag, context)),
		).toEqual(assignments);
		const controlCount = assignments.filter(
			(assignment) => assignment.variant === "control",
		).length;
		expect(controlCount).toBeGreaterThan(1200);
		expect(controlCount).toBeLessThan(1800);
		expect(
			assignments.some((assignment) => assignment.variant === "never"),
		).toBe(false);
		for (const context of contexts.slice(0, 100)) {
			expect(
				evaluateFlagVariant(flag, { ...context, sessionId: "ignored" }),
			).toEqual(evaluateFlagVariant(flag, context));
			expect(evaluateFlagVariant(flag, { sessionId: context.userId })).toEqual(
				evaluateFlagVariant(flag, context),
			);
		}
		const rollout = { ...flag, type: "rollout" as const, rolloutPct: 20 };
		const eligible = contexts.filter((context) =>
			evaluateFlag(rollout, context),
		);
		const ratio =
			eligible.filter(
				(context) =>
					evaluateFlagVariant(rollout, context).variant === "control",
			).length / eligible.length;
		expect(ratio).toBeGreaterThan(0.2);
		expect(ratio).toBeLessThan(0.4);
		expect(evaluateFlagVariant({ ...flag, enabled: false })).toEqual({
			result: false,
			variant: null,
		});
		expect(
			evaluateFlagVariant({ ...flag, archivedAt: definition.createdAt })
				.variant,
		).toBeNull();
		expect(
			evaluateFlagVariant({
				...flag,
				type: "segment",
				segments: [{ field: "userId", operator: "equals", value: "target" }],
			}).variant,
		).toBeNull();
		expect(evaluateFlagVariant(definition)).toEqual({
			result: true,
			variant: null,
		});
		expect(evaluateFlagVariant(flag)).toEqual(evaluateFlagVariant(flag, {}));
	});
	it("validates variant totals, unique keys and JSON payloads", () => {
		expect(
			createFlagSchema.safeParse({
				key: "test",
				name: "Test",
				variants: [
					{ key: "A", weight: 33.3 },
					{ key: "B", weight: 33.3 },
					{ key: "C", weight: 33.4 },
				],
			}).success,
		).toBe(true);
		for (const variants of [
			[{ key: "a", weight: 99 }],
			[
				{ key: "a", weight: -1 },
				{ key: "b", weight: 101 },
			],
			[
				{ key: "same", weight: 50 },
				{ key: "same", weight: 50 },
			],
			[{ key: "a", weight: 100, payload: null }],
			[{ key: "a", weight: 100, payload: [] }],
			[{ key: "a", weight: Infinity }],
		])
			expect(
				createFlagSchema.safeParse({ key: "test", name: "Test", variants })
					.success,
			).toBe(false);
		for (const payload of [
			"hello",
			42,
			false,
			{ nested: [null, true, { value: 1 }] },
		]) {
			expect(
				createFlagSchema.safeParse({
					key: "test",
					name: "Test",
					variants: [{ key: "a", weight: 100, payload }],
				}).success,
			).toBe(true);
		}
	});
	it("honors kill switches, archives and deterministic percentage boundaries", () => {
		expect(evaluateFlag(definition)).toBe(true);
		expect(evaluateFlag({ ...definition, enabled: false })).toBe(false);
		expect(
			evaluateFlag({ ...definition, archivedAt: definition.createdAt }),
		).toBe(false);
		const rollout = { ...definition, type: "rollout" as const, rolloutPct: 20 };
		const subjects = Array.from({ length: 1000 }, (_, i) => ({
			sessionId: `session-${i}`,
		}));
		const decisions = subjects.map((context) => evaluateFlag(rollout, context));
		expect(subjects.map((context) => evaluateFlag(rollout, context))).toEqual(
			decisions,
		);
		expect(decisions.filter(Boolean).length).toBeGreaterThan(120);
		expect(decisions.filter(Boolean).length).toBeLessThan(280);
		for (const context of subjects) {
			expect(evaluateFlag({ ...rollout, rolloutPct: 0 }, context)).toBe(false);
			expect(evaluateFlag({ ...rollout, rolloutPct: 100 }, context)).toBe(true);
		}
	});
	it("requires all user, email and tag rules and fails closed without targeting", () => {
		const segment: FeatureFlag = {
			...definition,
			type: "segment",
			segments: [
				{ field: "userId", operator: "in", value: ["a", "b"] },
				{ field: "email", operator: "equals", value: "a@example.com" },
				{ field: "tags", operator: "contains", value: "beta" },
			],
		};
		expect(
			evaluateFlag(segment, {
				userId: "a",
				email: "a@example.com",
				tags: ["beta"],
			}),
		).toBe(true);
		expect(
			evaluateFlag(segment, {
				userId: "c",
				email: "a@example.com",
				tags: ["beta"],
			}),
		).toBe(false);
		expect(evaluateFlag(segment)).toBe(false);
		expect(evaluateFlag({ ...segment, segments: [] })).toBe(false);
	});
	it("validates configuration and preserves omitted PATCH fields", () => {
		expect(updateFlagSchema.parse({ name: "Renamed" })).toEqual({
			name: "Renamed",
		});
		for (const data of [
			{ key: "bad_key", name: "Bad" },
			{ key: "constructor", name: "Bad" },
			{ key: "new", name: "Bad" },
			{ key: "rollout", name: "Bad", type: "rollout", rolloutPct: 101 },
			{ key: "rollout", name: "Bad", type: "rollout" },
			{ key: "segment", name: "Bad", type: "segment", segments: [] },
			{
				key: "segment",
				name: "Bad",
				type: "segment",
				segments: [{ field: "tags", operator: "equals", value: "beta" }],
			},
		])
			expect(createFlagSchema.safeParse(data).success).toBe(false);
	});
});

describe("feature flags backend", () => {
	it("persists variants, keeps boolean responses, audits assignments and invalidates cached variants", async () => {
		const onEvaluate = vi.fn((flag, _result, _context, ctx) => {
			expect(ctx).toHaveProperty("variant");
			expect(Object.isFrozen(flag.variants)).toBe(true);
			if (
				flag.variants[0]?.payload &&
				typeof flag.variants[0].payload === "object"
			)
				expect(Object.isFrozen(flag.variants[0].payload.nested)).toBe(true);
		});
		const { stack, operations } = setup({ hooks: { onEvaluate } }, "admin");
		const variants = [
			{ key: "blue", weight: 100, payload: { nested: { color: "blue" } } },
		];
		await operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
			variants,
		});
		expect((await operations.getFlag({ key: "checkout" })).variants).toEqual(
			variants,
		);
		const response = await stack.handler(request("variant/checkout"));
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({
			result: true,
			variant: "blue",
			payload: variants[0]!.payload,
		});
		expect(await operations.evaluate({ key: "checkout" })).toBe(true);
		expect(await operations.evaluateAll({})).toEqual({ checkout: true });
		expect(
			(await operations.listEvaluations({ key: "checkout" }))[0]?.variant,
		).toBe("blue");
		expect(onEvaluate.mock.calls[0]?.[3].variant).toBe("blue");
		await operations.updateFlag({ key: "checkout", data: { name: "Renamed" } });
		expect((await operations.getFlag({ key: "checkout" })).variants).toEqual(
			variants,
		);
		await operations.updateFlag({
			key: "checkout",
			data: { variants: [{ key: "green", weight: 100, payload: false }] },
		});
		expect(await operations.evaluateVariant({ key: "checkout" })).toEqual({
			result: true,
			variant: "green",
			payload: false,
		});
		await expect(
			operations.updateFlag({
				key: "checkout",
				data: { variants: [{ key: "bad", weight: 10 }] },
			}),
		).rejects.toThrow();
		await operations.toggleFlag({ key: "checkout", enabled: false });
		expect(await operations.evaluateVariant({ key: "checkout" })).toEqual({
			result: false,
			variant: null,
		});
		await operations.toggleFlag({ key: "checkout", enabled: true });
		await operations.updateFlag({ key: "checkout", data: { variants: [] } });
		expect(await operations.evaluateVariant({ key: "checkout" })).toEqual({
			result: true,
			variant: null,
		});
		expect(await operations.evaluateVariant({ key: "missing" })).toEqual({
			result: false,
			variant: null,
		});
		await operations.archiveFlag({ key: "checkout" });
		expect(
			(await operations.evaluateVariant({ key: "checkout" })).variant,
		).toBeNull();
	});
	it("protects variant authoring while exposing only the selected public payload", async () => {
		const { stack, operations } = setup();
		await operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
			variants: [
				{ key: "public", weight: 100, payload: 7 },
				{ key: "other", weight: 0, payload: "unselected" },
			],
		});
		expect(
			(
				await stack.handler(
					request("flags/checkout", "PATCH", { variants: [] }),
				)
			).status,
		).toBe(401);
		expect(
			await (await stack.handler(request("variant/checkout"))).json(),
		).toEqual({ result: true, variant: "public", payload: 7 });
		expect(
			(await stack.handler(request("variant/checkout?context=!!"))).status,
		).toBe(400);
	});
	it("protects management and logs but allows anonymous evaluations with private responses", async () => {
		const { stack, operations } = setup();
		await operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
		});
		for (const [path, method, body] of [
			["flags", "GET"],
			["flags/checkout", "GET"],
			["flags/checkout/log", "GET"],
			["flags", "POST", { key: "other", name: "Other" }],
			["flags/checkout", "PATCH", { name: "Denied" }],
			["flags/checkout/toggle", "POST", { enabled: false }],
			["flags/checkout/archive", "POST"],
		] as const)
			expect((await stack.handler(request(path, method, body))).status).toBe(
				401,
			);
		const result = await stack.handler(request("evaluate/checkout"));
		expect(result.status).toBe(200);
		expect(result.headers.get("cache-control")).toBe("private, no-store");
		expect(await result.json()).toBe(true);
		expect(await (await stack.handler(request("evaluate"))).json()).toEqual({
			checkout: true,
		});
		expect(await operations.evaluate({ key: "missing" })).toBe(false);
		const unauthorized = setup({}, "viewer");
		expect((await unauthorized.stack.handler(request("flags"))).status).toBe(
			403,
		);
	});
	it("uses HTTP and trusted operations consistently, preserves config on PATCH and invalidates all evaluations", async () => {
		const { stack, operations, adapter } = setup({}, "admin");
		const created = await stack.handler(
			request("flags", "POST", {
				key: "checkout",
				name: "Checkout",
				type: "rollout",
				enabled: true,
				rolloutPct: 100,
				tags: ["beta"],
			}),
		);
		expect(created.status).toBe(200);
		expect(await operations.evaluateAll({})).toEqual({ checkout: true });
		const querySpy = vi.spyOn(adapter(), "findMany");
		expect(await operations.evaluate({ key: "checkout" })).toBe(true);
		expect(await operations.evaluateAll({})).toEqual({ checkout: true });
		expect(querySpy).not.toHaveBeenCalled();
		const patched = await stack.handler(
			request("flags/checkout", "PATCH", { name: "Renamed" }),
		);
		expect(await patched.json()).toMatchObject({
			name: "Renamed",
			type: "rollout",
			enabled: true,
			rolloutPct: 100,
			tags: ["beta"],
		});
		await operations.toggleFlag({ key: "checkout", enabled: false });
		expect(await operations.evaluate({ key: "checkout" })).toBe(false);
		expect(await operations.evaluateAll({})).toEqual({ checkout: false });
		await operations.archiveFlag({ key: "checkout" });
		expect(await operations.evaluateAll({})).toEqual({});
		expect(await operations.evaluate({ key: "checkout" })).toBe(false);
		expect(await operations.listFlags({})).toEqual([]);
		expect(await operations.listFlags({ includeArchived: true })).toHaveLength(
			1,
		);
		await expect(
			operations.createFlag({ key: "checkout", name: "Duplicate" }),
		).rejects.toThrow("already exists");
		await expect(
			operations.toggleFlag({ key: "checkout", enabled: true }),
		).rejects.toThrow("Archived");
	});
	it("requires toggle permission when an update changes enabled", async () => {
		const before = vi.fn();
		const { stack, operations } = setup(
			{ hooks: { onBeforeToggle: before } },
			"editor",
		);
		await operations.createFlag({ key: "checkout", name: "Checkout" });
		expect(
			(
				await stack.handler(
					request("flags/checkout", "PATCH", { name: "Renamed" }),
				)
			).status,
		).toBe(200);
		expect(
			(
				await stack.handler(
					request("flags/checkout", "PATCH", { enabled: true }),
				)
			).status,
		).toBe(403);
		expect(await operations.evaluate({ key: "checkout" })).toBe(false);
		expect(before).not.toHaveBeenCalled();
	});
	it("rejects concurrent duplicate keys", async () => {
		const { operations } = setup();
		const results = await Promise.allSettled([
			operations.createFlag({ key: "same", name: "First" }),
			operations.createFlag({ key: "same", name: "Second" }),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(await operations.listFlags({})).toHaveLength(1);
	});
	it("refreshes expired cache, disables cache with TTL zero and isolates stack instances", async () => {
		vi.useFakeTimers();
		const one = setup({ cacheTtlMs: 30 });
		await one.operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
		});
		expect(await one.operations.evaluate({ key: "checkout" })).toBe(true);
		await one.adapter().update({
			model: "flag",
			where: [{ field: "key", value: "checkout", operator: "eq" }],
			update: { enabled: false },
		});
		expect(await one.operations.evaluate({ key: "checkout" })).toBe(true);
		vi.advanceTimersByTime(31);
		expect(await one.operations.evaluate({ key: "checkout" })).toBe(false);
		const two = setup({ cacheTtlMs: 0 });
		expect(await two.operations.evaluate({ key: "checkout" })).toBe(false);
		await two.operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
		});
		const spy = vi.spyOn(two.adapter(), "findMany");
		await two.operations.evaluate({ key: "checkout" });
		await two.operations.evaluate({ key: "checkout" });
		expect(spy).toHaveBeenCalledTimes(2);
	});
	it("rejects malformed context and decodes Unicode targeting context", async () => {
		const { stack, operations } = setup();
		await operations.createFlag({
			key: "beta",
			name: "Beta",
			enabled: true,
			type: "segment",
			segments: [{ field: "tags", operator: "contains", value: "bêta" }],
		});
		for (const raw of ["!!", btoa("not json"), btoa('{"tags":1}')])
			expect(
				(
					await stack.handler(
						request(`evaluate/beta?context=${encodeURIComponent(raw)}`),
					)
				).status,
			).toBe(400);
		const encoded = Buffer.from(JSON.stringify({ tags: ["bêta"] })).toString(
			"base64",
		);
		expect(
			await (
				await stack.handler(
					request(`evaluate/beta?context=${encodeURIComponent(encoded)}`),
				)
			).json(),
		).toBe(true);
	});
	it("runs veto and audit hooks for toggles and enabled updates, with bounded immutable logs", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const onEvaluate = vi.fn();
		const { operations } = setup({
			evaluationLogLimit: 2,
			hooks: { onBeforeToggle: before, onAfterToggle: after, onEvaluate },
		});
		await operations.createFlag({ key: "checkout", name: "Checkout" });
		before.mockImplementationOnce(() => {
			throw new Error("Veto");
		});
		await expect(
			operations.toggleFlag({ key: "checkout", enabled: true }),
		).rejects.toThrow("Veto");
		expect(await operations.evaluate({ key: "checkout" })).toBe(false);
		expect(after).not.toHaveBeenCalled();
		await operations.updateFlag({ key: "checkout", data: { enabled: true } });
		expect(after).toHaveBeenCalledOnce();
		await operations.evaluate({ key: "checkout", context: { tags: ["beta"] } });
		await operations.evaluate({ key: "checkout", context: { userId: "last" } });
		const logs = await operations.listEvaluations({ key: "checkout" });
		expect(logs).toHaveLength(2);
		expect(logs[0]?.context.userId).toBe("last");
		expect(Object.isFrozen(logs[1]?.context.tags)).toBe(true);
		expect(onEvaluate).toHaveBeenCalledTimes(3);
		expect(Object.isFrozen(onEvaluate.mock.calls[1]?.[0].segments)).toBe(true);
	});
	it("keeps bounded logs per flag when another flag receives more evaluations", async () => {
		const { operations } = setup({ evaluationLogLimit: 2 });
		await operations.createFlag({ key: "first", name: "First", enabled: true });
		await operations.createFlag({
			key: "second",
			name: "Second",
			enabled: true,
		});
		await operations.evaluate({
			key: "first",
			context: { userId: "first-user" },
		});
		for (const userId of ["old", "recent", "latest"])
			await operations.evaluate({ key: "second", context: { userId } });
		expect(
			(await operations.listEvaluations({ key: "first" })).map(
				(row) => row.context.userId,
			),
		).toEqual(["first-user"]);
		expect(
			(await operations.listEvaluations({ key: "second" })).map(
				(row) => row.context.userId,
			),
		).toEqual(["latest", "recent"]);
	});
	it("does not restore an invalidated snapshot when an older cache read finishes", async () => {
		const { operations, adapter } = setup();
		await operations.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
		});
		const cache = createFlagCache(adapter(), 30000);
		const original = adapter().findMany.bind(adapter());
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.spyOn(adapter(), "findMany").mockImplementationOnce(async (query) => {
			const rows = await original(query);
			await held;
			return rows;
		});
		const stale = cache.load();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await adapter().update({
			model: "flag",
			where: [{ field: "key", value: "checkout", operator: "eq" }],
			update: { enabled: false },
		});
		cache.invalidate();
		release();
		expect((await stale)[0]?.enabled).toBe(false);
	});
	it("fails closed for corrupted stored targeting JSON", async () => {
		const { operations, adapter } = setup();
		await operations.createFlag({
			key: "beta",
			name: "Beta",
			enabled: true,
			type: "segment",
			segments: [{ field: "tags", operator: "contains", value: "beta" }],
		});
		await adapter().update<FlagRecord>({
			model: "flag",
			where: [{ field: "key", value: "beta", operator: "eq" }],
			update: { segments: "not-json" },
		});
		expect(
			await operations.evaluate({ key: "beta", context: { tags: ["beta"] } }),
		).toBe(false);
	});
});
