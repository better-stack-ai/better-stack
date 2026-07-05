// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "../context";
import type { ResourcesDeclaration } from "../plugins/client";
import { createResource } from "../plugins/client/hooks";
import type { ResourceFormResult } from "../plugins/client/hooks";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface Item {
	id: string;
	slug: string;
	name: string;
}

interface FormValues {
	name: string;
}

const resources = {
	items: {
		queries: {
			detail: {
				path: "/items",
				query: (slug: string) => ({ slug, limit: 1 }),
				key: (slug: string) => [slug],
				select: (data: any): Item | null => data?.items?.[0] ?? null,
				skip: (slug: string) => !slug,
			},
		},
		mutations: {
			create: {
				path: "@post/items",
				method: "POST" as const,
				input: (vars: { name: string }) => ({ body: vars }),
				select: (data: any) => data as Item | null,
				invalidates: ["items"],
			},
			update: {
				path: "@put/items/:id",
				method: "PUT" as const,
				input: (vars: { id: string; data: { name: string } }) => ({
					params: { id: vars.id },
					body: vars.data,
				}),
				select: (data: any) => data as Item | null,
				invalidates: ["items"],
			},
		},
	},
} satisfies ResourcesDeclaration;

const items = createResource({ plugin: "test-plugin", resources });

type FormHookConfig = Parameters<typeof items.items.useForm<FormValues>>[0];

describe("resource useForm", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let navigate: ReturnType<typeof vi.fn>;
	let refresh: ReturnType<typeof vi.fn>;
	let notifySuccess: ReturnType<typeof vi.fn>;
	let notifyError: ReturnType<typeof vi.fn>;
	let fetchMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		navigate = vi.fn();
		refresh = vi.fn();
		notifySuccess = vi.fn();
		notifyError = vi.fn();
		fetchMock = vi.spyOn(globalThis, "fetch" as any);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
		vi.restoreAllMocks();
	});

	function jsonResponse(body: unknown, status = 200) {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}

	async function renderForm(
		config: FormHookConfig,
		onCapture: (form: ResourceFormResult<FormValues, Item | null>) => void,
	) {
		function Probe() {
			const form = items.items.useForm<FormValues>(config);
			onCapture(form as ResourceFormResult<FormValues, Item | null>);
			return null;
		}
		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					notify={{ success: notifySuccess, error: notifyError }}
					overrides={{
						"test-plugin": {
							apiBaseURL: "http://test.local",
							apiBasePath: "/api/data",
							navigate,
							refresh,
						},
					}}
				>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});
	}

	async function waitFor(check: () => boolean, timeout = 3000) {
		const start = Date.now();
		while (!check()) {
			if (Date.now() - start > timeout) {
				throw new Error("waitFor timed out");
			}
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		}
	}

	it("create: submits the create mutation, notifies and redirects", async () => {
		const created: Item = { id: "1", slug: "one", name: "One" };
		fetchMock.mockResolvedValue(jsonResponse(created));

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "create",
				successMessage: "Item saved",
				redirect: (result) => `/items/${(result as Item).slug}`,
			},
			(value) => {
				form = value;
			},
		);

		expect(form.record).toBeNull();
		expect(form.isLoadingRecord).toBe(false);

		let result: unknown;
		await act(async () => {
			result = await form.submit({ name: "One" });
		});

		expect(result).toEqual(created);
		const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
		expect(String(url)).toContain("/api/data/items");
		expect(init.method).toBe("POST");
		expect(notifySuccess).toHaveBeenCalledWith("Item saved");
		expect(navigate).toHaveBeenCalledWith("/items/one");
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(form.error).toBeNull();
		expect(form.fieldErrors).toEqual({});
	});

	it("edit: fetches the record, derives defaults and submits the update mutation", async () => {
		const existing: Item = { id: "9", slug: "nine", name: "Nine" };
		fetchMock.mockImplementation(async (input: any, init?: any) => {
			void input;
			const method = (init as RequestInit | undefined)?.method;
			if (!method || method === "GET") {
				return jsonResponse({ items: [existing] });
			}
			return jsonResponse({ ...existing, name: "Nine v2" });
		});

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "edit",
				id: "nine",
				defaults: (record) => ({ name: (record as Item | null)?.name ?? "" }),
				toUpdateVars: (values, record) => ({
					id: (record as Item).id,
					data: values,
				}),
				successMessage: "Item updated",
			},
			(value) => {
				form = value;
			},
		);

		await waitFor(() => form.record !== null);
		expect(form.record).toEqual(existing);
		expect(form.defaultValues).toEqual({ name: "Nine" });

		await act(async () => {
			await form.submit({ name: "Nine v2" });
		});

		const putCall = fetchMock.mock.calls.find(
			(call) => (call[1] as RequestInit | undefined)?.method === "PUT",
		);
		expect(putCall).toBeDefined();
		expect(String(putCall?.[0])).toContain("/api/data/items/9");
		expect(notifySuccess).toHaveBeenCalledWith("Item updated");
	});

	it("edit: uses an externally supplied record without fetching", async () => {
		const external: Item = { id: "5", slug: "five", name: "Five" };

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "edit",
				record: external,
				defaults: (record) => ({ name: (record as Item | null)?.name ?? "" }),
			},
			(value) => {
				form = value;
			},
		);

		expect(form.record).toEqual(external);
		expect(form.defaultValues).toEqual({ name: "Five" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("maps server validation issues onto fieldErrors without a toast", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				{
					message: "[body.name] Name is required",
					code: "VALIDATION_ERROR",
					issues: [{ path: ["name"], message: "Name is required" }],
				},
				400,
			),
		);

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "create",
				successMessage: "saved",
				errorMessage: "Failed to save",
			},
			(value) => {
				form = value;
			},
		);

		let result: unknown = "sentinel";
		await act(async () => {
			result = await form.submit({ name: "" });
		});

		expect(result).toBeUndefined();
		expect(form.fieldErrors).toEqual({ name: "Name is required" });
		expect(form.error?.statusCode).toBe(400);
		// Field-level failures do not produce a generic toast
		expect(notifyError).not.toHaveBeenCalled();
		expect(notifySuccess).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("notifies errorMessage for non-field errors", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ message: "Internal error" }, 500),
		);

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "create",
				errorMessage: (error) => `Save failed: ${error.message}`,
			},
			(value) => {
				form = value;
			},
		);

		await act(async () => {
			await form.submit({ name: "x" });
		});

		expect(form.error?.message).toBe("Internal error");
		expect(form.fieldErrors).toEqual({});
		expect(notifyError).toHaveBeenCalledWith("Save failed: Internal error");
	});

	it("clearErrors resets the error state", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				{
					message: "invalid",
					issues: [{ path: ["name"], message: "Bad" }],
				},
				400,
			),
		);

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm({ action: "create" }, (value) => {
			form = value;
		});

		await act(async () => {
			await form.submit({ name: "" });
		});
		expect(form.fieldErrors).toEqual({ name: "Bad" });

		await act(async () => {
			form.clearErrors();
		});
		expect(form.error).toBeNull();
		expect(form.fieldErrors).toEqual({});
	});

	it("skips navigation when redirect resolves falsy", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ id: "1", slug: "one", name: "One" }),
		);

		let form!: ResourceFormResult<FormValues, Item | null>;
		await renderForm(
			{
				action: "create",
				redirect: () => false,
			},
			(value) => {
				form = value;
			},
		);

		await act(async () => {
			await form.submit({ name: "One" });
		});

		expect(navigate).not.toHaveBeenCalled();
	});
});
