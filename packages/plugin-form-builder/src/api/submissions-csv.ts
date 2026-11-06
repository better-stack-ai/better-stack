import type { SerializedFormSubmissionWithData } from "../types";

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
	const rows = submissions.map((submission) => ({
		submission,
		data: JSON.parse(submission.data) as Record<string, unknown>,
	}));
	const fields = [
		...new Set([
			...fieldNames,
			...rows.flatMap((row) => Object.keys(row.data)),
		]),
	];
	const header = [
		"id",
		"submittedAt",
		...fields.map((field) => `data.${field}`),
	];
	return (
		[
			header,
			...rows.map(({ submission, data }) => [
				submission.id,
				new Date(submission.submittedAt).toISOString(),
				...fields.map((field) =>
					Object.hasOwn(data, field) ? data[field] : undefined,
				),
			]),
		]
			.map((row) => row.map(csvCell).join(","))
			.join("\r\n") + "\r\n"
	);
}
