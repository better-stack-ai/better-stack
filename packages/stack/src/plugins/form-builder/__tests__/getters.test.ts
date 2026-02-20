import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { Adapter } from "@btst/db";
import { formBuilderSchema } from "../db";
import { getAllForms, getFormBySlug, getFormSubmissions } from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(formBuilderSchema);
	return createMemoryAdapter(db)({});
};

const SIMPLE_SCHEMA = JSON.stringify({
	type: "object",
	properties: { name: { type: "string" } },
});

async function createForm(
	adapter: Adapter,
	slug: string,
	status = "active",
): Promise<any> {
	return adapter.create({
		model: "form",
		data: {
			name: `Form ${slug}`,
			slug,
			schema: SIMPLE_SCHEMA,
			status,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

describe("form-builder getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	describe("getAllForms", () => {
		it("returns empty result when no forms exist", async () => {
			const result = await getAllForms(adapter);
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("returns all forms serialized", async () => {
			await createForm(adapter, "contact");
			await createForm(adapter, "feedback");

			const result = await getAllForms(adapter);
			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(typeof result.items[0]!.createdAt).toBe("string");
		});

		it("filters forms by status", async () => {
			await createForm(adapter, "active-form", "active");
			await createForm(adapter, "inactive-form", "inactive");

			const active = await getAllForms(adapter, { status: "active" });
			expect(active.items).toHaveLength(1);
			expect(active.items[0]!.slug).toBe("active-form");

			const inactive = await getAllForms(adapter, { status: "inactive" });
			expect(inactive.items).toHaveLength(1);
			expect(inactive.items[0]!.slug).toBe("inactive-form");
		});

		it("respects limit and offset", async () => {
			for (let i = 1; i <= 4; i++) {
				await createForm(adapter, `form-${i}`);
			}

			const page1 = await getAllForms(adapter, { limit: 2, offset: 0 });
			expect(page1.items).toHaveLength(2);
			expect(page1.total).toBe(4);

			const page2 = await getAllForms(adapter, { limit: 2, offset: 2 });
			expect(page2.items).toHaveLength(2);
		});
	});

	describe("getFormBySlug", () => {
		it("returns null when form does not exist", async () => {
			const form = await getFormBySlug(adapter, "nonexistent");
			expect(form).toBeNull();
		});

		it("returns the form when it exists", async () => {
			await createForm(adapter, "contact");

			const form = await getFormBySlug(adapter, "contact");
			expect(form).not.toBeNull();
			expect(form!.slug).toBe("contact");
			expect(typeof form!.createdAt).toBe("string");
		});
	});

	describe("getFormSubmissions", () => {
		it("returns empty result when form does not exist", async () => {
			const result = await getFormSubmissions(adapter, "nonexistent-id");
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("returns submissions for a form", async () => {
			const form = (await createForm(adapter, "contact")) as any;

			await adapter.create({
				model: "formSubmission",
				data: {
					formId: form.id,
					data: JSON.stringify({ name: "Alice" }),
					submittedAt: new Date(),
				},
			});
			await adapter.create({
				model: "formSubmission",
				data: {
					formId: form.id,
					data: JSON.stringify({ name: "Bob" }),
					submittedAt: new Date(),
				},
			});

			const result = await getFormSubmissions(adapter, form.id);
			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(2);
			expect(typeof result.items[0]!.submittedAt).toBe("string");
			expect(result.items[0]!.parsedData).toBeDefined();
		});

		it("respects pagination", async () => {
			const form = (await createForm(adapter, "survey")) as any;

			for (let i = 1; i <= 5; i++) {
				await adapter.create({
					model: "formSubmission",
					data: {
						formId: form.id,
						data: JSON.stringify({ name: `User ${i}` }),
						submittedAt: new Date(Date.now() + i * 1000),
					},
				});
			}

			const page1 = await getFormSubmissions(adapter, form.id, {
				limit: 2,
				offset: 0,
			});
			expect(page1.items).toHaveLength(2);
			expect(page1.total).toBe(5);
		});
	});
});
