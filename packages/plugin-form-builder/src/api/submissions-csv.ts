import { OperationHttpError } from "@btst/stack/plugins/api";
import type { SerializedFormSubmissionWithData } from "../types";

export const CSV_EXPORT_MAX_ROWS = 10_000;
export const CSV_EXPORT_MAX_BYTES = 10 * 1024 * 1024;
const CSV_EXPORT_MAX_COLUMNS = 1_000;
const CSV_EXPORT_MAX_CELLS = 1_000_000;

export function csvExportLimitError() {
	return new OperationHttpError(
		413,
		"CSV export exceeds the supported row, column, cell or 10 MiB size limit.",
		"FORM_EXPORT_TOO_LARGE",
	);
}

/** Quote CSV cells and prevent spreadsheet formula execution. */
function csvCell(value: unknown): string {
	let text =
		value == null
			? ""
			: typeof value === "object"
				? JSON.stringify(value)
				: String(value);
	if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

/** Serialize submissions, including fields removed from the current form schema. */
export function submissionsToCsv(
	submissions: SerializedFormSubmissionWithData[],
	fieldNames: string[],
): string {
	const encoder = new TextEncoder();
	const columns = new Set(fieldNames);
	const rows: {
		submission: SerializedFormSubmissionWithData;
		data: Record<string, unknown>;
	}[] = [];
	let sourceBytes = 0;
	if (
		submissions.length > CSV_EXPORT_MAX_ROWS ||
		columns.size > CSV_EXPORT_MAX_COLUMNS ||
		columns.size * submissions.length > CSV_EXPORT_MAX_CELLS
	)
		throw csvExportLimitError();
	for (const submission of submissions) {
		sourceBytes += encoder.encode(submission.data).byteLength;
		if (sourceBytes > CSV_EXPORT_MAX_BYTES) throw csvExportLimitError();
		const data = JSON.parse(submission.data) as Record<string, unknown>;
		for (const key of Object.keys(data)) {
			columns.add(key);
			if (
				columns.size > CSV_EXPORT_MAX_COLUMNS ||
				columns.size * submissions.length > CSV_EXPORT_MAX_CELLS
			)
				throw csvExportLimitError();
		}
		rows.push({ submission, data });
	}
	const fields = [...columns];
	const lines: string[] = [];
	let outputBytes = 0;
	const appendRow = (values: unknown[]) => {
		const line = values.map(csvCell).join(",") + "\r\n";
		outputBytes += encoder.encode(line).byteLength;
		if (outputBytes > CSV_EXPORT_MAX_BYTES) throw csvExportLimitError();
		lines.push(line);
	};
	const header = [
		"id",
		"submittedAt",
		...fields.map((field) => `data.${field}`),
	];
	appendRow(header);
	for (const { submission, data } of rows) {
		appendRow([
			submission.id,
			new Date(submission.submittedAt).toISOString(),
			...fields.map((field) =>
				Object.hasOwn(data, field) ? data[field] : undefined,
			),
		]);
	}
	return lines.join("");
}
