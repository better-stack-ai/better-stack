/** Match JSON transport timestamps before populating the React Query cache. */
export function serializeSchoolRecord<T>(record: T): T {
	return JSON.parse(JSON.stringify(record)) as T;
}
