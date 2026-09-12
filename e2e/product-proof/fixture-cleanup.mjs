// Capture owns only these exact fixture identities from dogfood-data.json.
// List every page before deleting so offsets cannot shift past owned records.
async function matchingRecords(send, path, params, matches) {
	const records = [];
	for (let offset = 0; ; offset += 100) {
		const response = await send(
			"GET",
			`${path}?${new URLSearchParams({ ...params, limit: "100", offset: String(offset) })}`,
		);
		if (!Array.isArray(response.items))
			throw new Error(`Invalid fixture list: ${path}`);
		records.push(...response.items.filter(matches));
		if (response.items.length < 100) return records;
	}
}

// Memory fixtures do not enforce SQL foreign-key cascades. Delete the owned
// tree explicitly and keep failed ancestors discoverable for the next cleanup.
export async function cleanupBoard(send, boardId) {
	const board = await send(
		"GET",
		`/api/data/boards/${encodeURIComponent(boardId)}`,
	);
	if (!Array.isArray(board.columns))
		throw new Error("Invalid fixture board tree");
	const errors = [];
	for (const column of board.columns) {
		if (!Array.isArray(column.tasks)) {
			errors.push(new Error("Invalid fixture column tasks"));
			continue;
		}
		const failuresBefore = errors.length;
		for (const task of column.tasks) {
			try {
				await send("DELETE", `/api/data/tasks/${encodeURIComponent(task.id)}`);
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length === failuresBefore) {
			try {
				await send(
					"DELETE",
					`/api/data/columns/${encodeURIComponent(column.id)}`,
				);
			} catch (error) {
				errors.push(error);
			}
		}
	}
	if (errors.length)
		throw new AggregateError(errors, "Product proof board cleanup failed");
	await send("DELETE", `/api/data/boards/${encodeURIComponent(boardId)}`);
}

export async function cleanupFixtures(send, seed) {
	const bySlug = (fixtures) => (item) =>
		fixtures.some((fixture) => fixture.slug === item.slug);
	const targets = [
		...seed.comments.flatMap((comment) =>
			["pending", "approved", "spam"].map((status) => ({
				path: "/api/data/comments",
				params: {
					resourceId: comment.resourceId,
					resourceType: comment.resourceType,
					status,
				},
				matches: (item) =>
					item.resourceId === comment.resourceId &&
					item.resourceType === comment.resourceType &&
					item.body === comment.body,
			})),
		),
		{ path: "/api/data/posts", matches: bySlug(seed.posts) },
		{
			path: `/api/data/content/${seed.cms.typeSlug}`,
			matches: bySlug(seed.cms.records),
		},
		{
			path: "/api/data/boards",
			matches: bySlug([seed.kanban]),
			remove: (item) => cleanupBoard(send, item.id),
		},
		{
			path: "/api/data/content/ui-builder-page",
			matches: bySlug([seed.uiBuilder]),
		},
		{
			path: "/api/data/media/assets",
			params: { query: seed.media.uploadName },
			matches: (item) => item.originalName === seed.media.uploadName,
		},
	];
	const errors = [];
	for (const { path, params, matches, remove } of targets) {
		try {
			for (const item of await matchingRecords(send, path, params, matches)) {
				try {
					if (remove) await remove(item);
					else await send("DELETE", `${path}/${encodeURIComponent(item.id)}`);
				} catch (error) {
					errors.push(error);
				}
			}
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length)
		throw new AggregateError(errors, "Product proof fixture cleanup failed");
}

export async function withFixtureCleanup(send, seed, capture) {
	const errors = [];
	let result;
	try {
		await cleanupFixtures(send, seed);
		result = await capture();
	} catch (error) {
		errors.push(error);
	}
	try {
		await cleanupFixtures(send, seed);
	} catch (error) {
		errors.push(error);
	}
	if (errors.length)
		throw new AggregateError(
			errors,
			"Product proof capture or fixture cleanup failed",
		);
	return result;
}
