export const post = {
	id: "benchmark",
	slug: "benchmark",
	title: "A practical guide to a shared project workspace",
	excerpt:
		"The same article, editor, and dashboard data in both production builds.",
	content: Array.from(
		{ length: 12 },
		(_, index) =>
			`## Project note ${index + 1}\n\nA shared workspace keeps project notes, responsibilities, and decisions together. Teams can review the same information and update their next steps.\n\n- Record the decision and its owner.\n- Keep the next action visible.\n- Review the outcome together.\n`,
	).join("\n"),
	published: true,
	tags: [],
	authorId: "benchmark-user",
	image: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

export const contentTypes = [
	{
		id: "article",
		slug: "article",
		name: "Articles",
		jsonSchema: "{}",
		itemCount: 12,
		createdAt: post.createdAt,
		updatedAt: post.updatedAt,
	},
];
export const boards = [
	{
		id: "project",
		slug: "project",
		name: "Project delivery",
		description: "A shared delivery board",
		createdAt: post.createdAt,
		updatedAt: post.updatedAt,
	},
];
