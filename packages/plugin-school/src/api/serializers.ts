/** Match JSON transport timestamps before populating the React Query cache. */
export function serializeSchoolRecord<T>(record: T): T {
	return JSON.parse(
		JSON.stringify(record, (key, value) =>
			key === "payment" ? undefined : value,
		),
	) as T;
}
