import { post, contentTypes, boards } from "../../data";
export function GET(request: Request) {
	const path = new URL(request.url).pathname;
	if (path.includes("next-previous"))
		return Response.json({ previousPost: null, nextPost: null });
	if (path.includes("tags")) return Response.json([]);
	if (path.includes("content-types")) return Response.json(contentTypes);
	if (path.includes("boards"))
		return Response.json({ items: boards, total: 1 });
	if (path.includes("posts/benchmark")) return Response.json(post);
	return Response.json({ items: [], total: 0 });
}
