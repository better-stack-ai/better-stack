import { OperationHttpError } from "@btst/stack/plugins/api";
import type { Subscriber } from "../types";

/** RFC 4180 rows, including escaped quotes, commas and embedded newlines. */
export function parseSubscriberCsv(csv: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [],
		cell = "",
		quoted = false,
		closed = false;
	for (let i = 0; i < csv.length; i++) {
		const char = csv[i];
		if (char === '"') {
			if (quoted && csv[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (quoted) {
				quoted = false;
				closed = true;
			} else if (!cell && !closed) quoted = true;
			else
				throw new OperationHttpError(400, "Invalid CSV quoting", "INVALID_CSV");
		} else if (quoted) cell += char;
		else if (char === ",") {
			row.push(cell);
			cell = "";
			closed = false;
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && csv[i + 1] === "\n") i++;
			row.push(cell);
			if (row.some(Boolean)) rows.push(row);
			row = [];
			cell = "";
			closed = false;
		} else if (closed)
			throw new OperationHttpError(400, "Invalid CSV quoting", "INVALID_CSV");
		else cell += char;
	}
	if (quoted)
		throw new OperationHttpError(400, "Unclosed CSV quote", "INVALID_CSV");
	row.push(cell);
	if (row.some(Boolean)) rows.push(row);
	const headers =
		rows.shift()?.map((value) =>
			value
				.replace(/^\uFEFF/, "")
				.trim()
				.toLowerCase(),
		) ?? [];
	if (
		!headers.includes("email") ||
		new Set(headers).size !== headers.length ||
		rows.length > 10_000
	)
		throw new OperationHttpError(
			400,
			"CSV requires unique headers including email, and at most 10000 subscribers",
			"INVALID_CSV",
		);
	return rows.map((values) => {
		if (values.length !== headers.length)
			throw new OperationHttpError(
				400,
				"CSV rows must match the header columns",
				"INVALID_CSV",
			);
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""]),
		);
	});
}

function csvCell(value: string) {
	// Prefix spreadsheet formulas without altering stored subscriber data.
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}
/** Export no token fields and prevent spreadsheet formula evaluation. */
export function exportSubscriberCsv(subscribers: Subscriber[]): string {
	return [
		"email,name,status,tags",
		...subscribers.map((item) =>
			[item.email, item.name ?? "", item.status, JSON.stringify(item.tags)]
				.map(csvCell)
				.join(","),
		),
	].join("\r\n");
}
