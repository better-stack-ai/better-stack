"use client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import { PostCard } from "@btst/plugin-blog/client/components";
import { cmsClientPlugin } from "@btst/plugin-cms/client";
import { useContentTypes } from "@btst/plugin-cms/client/hooks";
import { kanbanClientPlugin } from "@btst/plugin-kanban/client";
import { useBoards } from "@btst/plugin-kanban/client/hooks";
import "@btst/plugin-blog/css";
import "@btst/plugin-cms/css";
import { Shell } from "../shell";
import { auth } from "../blog-auth";
import { post } from "../data";
function Dashboard() {
	const { contentTypes } = useContentTypes();
	const result = useBoards();
	return (
		<section data-benchmark="content">
			<h1>Project workspace dashboard</h1>
			<PostCard post={post} />
			<h2>Content types</h2>
			<ul>
				{contentTypes.map((type) => (
					<li key={type.id}>{type.name}</li>
				))}
			</ul>
			<h2>Delivery boards</h2>
			<p>{JSON.stringify(result.data ?? null)}</p>
		</section>
	);
}
export default function Page() {
	return (
		<Shell
			plugins={{
				blog: blogClientPlugin(),
				cms: cmsClientPlugin(),
				kanban: kanbanClientPlugin(),
			}}
			auth={auth}
		>
			<Dashboard />
		</Shell>
	);
}
