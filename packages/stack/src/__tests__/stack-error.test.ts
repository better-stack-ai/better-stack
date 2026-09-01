import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRouter } from "better-call";
import { createEndpoint } from "../plugins/api";
import { isErrorResponse, toError, type StackError } from "../plugins/client";

describe("isErrorResponse", () => {
	it("detects better-call error responses", () => {
		expect(isErrorResponse({ error: { message: "boom" } })).toBe(true);
		expect(isErrorResponse({ error: null, data: [] })).toBe(false);
		expect(isErrorResponse({ data: [] })).toBe(false);
		expect(isErrorResponse(null)).toBe(false);
		expect(isErrorResponse("nope")).toBe(false);
	});
});

describe("toError", () => {
	it("passes through Error instances", () => {
		const original = new Error("original");
		expect(toError(original)).toBe(original);
	});

	it("extracts message from object errors and preserves properties", () => {
		const error = toError({ message: "boom", code: "SOME_CODE" });
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("boom");
		expect((error as StackError & { code?: string }).code).toBe("SOME_CODE");
	});

	it("falls back to the error string property, then JSON", () => {
		expect(toError({ error: "denied" }).message).toBe("denied");
		expect(toError({ foo: 1 }).message).toBe('{"foo":1}');
	});

	it("wraps primitive values", () => {
		expect(toError("nope").message).toBe("nope");
		expect(toError(42).message).toBe("42");
	});

	it("normalizes statusCode from status or statusCode", () => {
		expect(toError({ message: "x", status: 404 }).statusCode).toBe(404);
		expect(toError({ message: "x", statusCode: 403 }).statusCode).toBe(403);
		expect(toError({ message: "x" }).statusCode).toBeUndefined();
	});

	it("maps validation issues to field errors", () => {
		const error = toError({
			message: "[body.title] Required; [body.tags.0.name] Too short",
			code: "VALIDATION_ERROR",
			issues: [
				{ path: ["title"], message: "Required" },
				{ path: ["tags", 0, "name"], message: "Too short" },
			],
		});
		expect(error.errors).toEqual({
			title: "Required",
			"tags.0.name": "Too short",
		});
	});

	it("collects multiple issues on the same field into an array", () => {
		const error = toError({
			message: "invalid",
			issues: [
				{ path: ["slug"], message: "Too short" },
				{ path: ["slug"], message: "Invalid characters" },
			],
		});
		expect(error.errors).toEqual({
			slug: ["Too short", "Invalid characters"],
		});
	});

	it("skips issues without a path", () => {
		const error = toError({
			message: "invalid",
			issues: [{ path: [], message: "Something is wrong" }],
		});
		expect(error.errors).toBeUndefined();
	});

	it("keeps a pre-shaped errors record", () => {
		const error = toError({
			message: "invalid",
			errors: { title: "Required", tags: ["a", "b"] },
		});
		expect(error.errors).toEqual({ title: "Required", tags: ["a", "b"] });
	});

	it("drops a non-conforming errors property", () => {
		const error = toError({ message: "invalid", errors: 42 });
		expect(error.errors).toBeUndefined();
	});
});

describe("createEndpoint validation issue preservation", () => {
	const createItem = createEndpoint(
		"/items",
		{
			method: "POST",
			body: z.object({
				title: z.string().min(1, "Title is required"),
				count: z.number(),
			}),
		},
		async (ctx) => ctx.body,
	);

	it("includes serialized Zod issues in the 400 response body", async () => {
		const router = createRouter({ createItem });
		const response = await router.handler(
			new Request("http://localhost/items", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "", count: "not-a-number" }),
			}),
		);

		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(Array.isArray(body.issues)).toBe(true);

		// Round-trip: the response body maps onto StackError field errors
		const error = toError({ ...body, status: response.status });
		expect(error.statusCode).toBe(400);
		expect(error.errors).toBeDefined();
		expect(error.errors?.title).toBe("Title is required");
		expect(error.errors?.count).toBeDefined();
	});

	it("keeps valid requests working", async () => {
		const router = createRouter({ createItem });
		const response = await router.handler(
			new Request("http://localhost/items", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ title: "hello", count: 2 }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ title: "hello", count: 2 });
	});

	it("respects a user-provided onValidationError", async () => {
		let observed: unknown;
		const custom = createEndpoint(
			"/custom",
			{
				method: "POST",
				body: z.object({ name: z.string() }),
				onValidationError: (error: unknown) => {
					observed = error;
				},
			},
			async (ctx) => ctx.body,
		);
		const router = createRouter({ custom });
		const response = await router.handler(
			new Request("http://localhost/custom", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);

		// Default better-call behavior: 400 without issues in the body
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.issues).toBeUndefined();
		expect(observed).toBeDefined();
	});
});
