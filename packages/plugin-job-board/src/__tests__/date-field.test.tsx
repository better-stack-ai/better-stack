// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import AutoFormDate from "@workspace/ui/components/auto-form/fields/date";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";
import {
	formSchemaToZod,
	zodToFormSchema,
} from "@workspace/ui/lib/schema-converter";
import { jobSchema } from "../schemas";

(
	globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@workspace/ui/components/date-picker", () => ({
	DatePicker: ({
		date,
		setDate,
	}: {
		date?: Date;
		setDate: (value?: Date) => void;
	}) => (
		<>
			<button
				type="button"
				data-day={date?.getDate()}
				onClick={() => setDate(new Date(2030, 0, 7))}
			>
				Choose January 7
			</button>
			<button type="button" data-clear onClick={() => setDate(undefined)}>
				Clear date
			</button>
		</>
	),
}));
vi.mock("@workspace/ui/components/form", () => ({
	FormControl: ({ children }: { children: React.ReactNode }) => children,
	FormItem: ({ children }: { children: React.ReactNode }) => children,
	FormMessage: () => null,
}));
vi.mock("@workspace/ui/components/auto-form/common/label", () => ({
	default: () => null,
}));
vi.mock("@workspace/ui/components/auto-form/common/tooltip", () => ({
	default: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllEnvs();
});

async function renderDate(schema: z.ZodType, value?: string) {
	const onChange = vi.fn();
	const props: AutoFormInputComponentProps = {
		label: "Closing date",
		isRequired: false,
		zodItem: schema,
		fieldConfigItem: {},
		fieldProps: {},
		zodInputProps: {},
		field: {
			name: "closingDate",
			value,
			onChange,
			onBlur: vi.fn(),
			ref: vi.fn(),
		},
	};
	await act(async () => root.render(<AutoFormDate {...props} />));
	return { onChange, button: container.querySelector("button")! };
}

describe("CMS date-only fields", () => {
	it("preserves date-only selection and null clearing after the CMS schema storage roundtrip", async () => {
		vi.stubEnv("TZ", "Asia/Tokyo");
		const storedSchema = JSON.parse(JSON.stringify(zodToFormSchema(jobSchema)));
		const reconstructed = formSchemaToZod(storedSchema) as z.ZodObject<{
			closingDate: z.ZodType;
		}>;
		const closingDate = reconstructed.shape.closingDate!;
		const { onChange, button } = await renderDate(closingDate);
		await act(async () => button.click());
		expect(onChange).toHaveBeenLastCalledWith("2030-01-07");
		expect(closingDate.safeParse(onChange.mock.calls[0]?.[0]).success).toBe(
			true,
		);
		await act(async () =>
			container.querySelector<HTMLButtonElement>("[data-clear]")!.click(),
		);
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(closingDate.safeParse(null).success).toBe(true);
	});
	it.each([
		["Zod ISO date", z.iso.date().optional()],
		["JSON Schema date", z.fromJSONSchema({ type: "string", format: "date" })],
	] as const)(
		"preserves the selected Tokyo calendar day for %s",
		async (_name, schema) => {
			vi.stubEnv("TZ", "Asia/Tokyo");
			const { onChange, button } = await renderDate(schema);
			await act(async () => button.click());
			expect(onChange).toHaveBeenCalledWith("2030-01-07");
		},
	);

	it("loads a stored calendar day in Los Angeles without shifting to the previous day", async () => {
		vi.stubEnv("TZ", "America/Los_Angeles");
		const { button } = await renderDate(z.iso.date(), "2030-01-07");
		expect(button.dataset.day).toBe("7");
	});

	it("retains ISO timestamps for date-time schemas", async () => {
		vi.stubEnv("TZ", "Asia/Tokyo");
		const { onChange, button } = await renderDate(z.iso.datetime());
		await act(async () => button.click());
		expect(onChange).toHaveBeenCalledWith("2030-01-06T15:00:00.000Z");
	});

	it("retains Date objects for z.date schemas", async () => {
		vi.stubEnv("TZ", "Asia/Tokyo");
		const { onChange, button } = await renderDate(z.date());
		await act(async () => button.click());
		expect(onChange.mock.calls[0]?.[0]).toBeInstanceOf(Date);
		expect(onChange.mock.calls[0]?.[0].getDate()).toBe(7);
	});

	it.each([
		["nullable date-only", z.iso.date().nullable().optional(), null],
		["optional date-only", z.iso.date().optional(), undefined],
		["nullable date-time", z.iso.datetime().nullable().optional(), undefined],
		["nullable Date object", z.date().nullable().optional(), undefined],
	] as const)(
		"clears %s fields without changing other date contracts",
		async (_name, schema, expected) => {
			const { onChange } = await renderDate(schema);
			await act(async () =>
				container.querySelector<HTMLButtonElement>("[data-clear]")!.click(),
			);
			expect(onChange).toHaveBeenCalledWith(expected);
		},
	);
});
