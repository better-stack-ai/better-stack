"use client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import { PostPage } from "@btst/plugin-blog/client/pages/post";
import "@btst/plugin-blog/css";
import { Shell } from "../shell";
import { auth } from "../blog-auth";
export default function Page() {
	return (
		<Shell plugins={{ blog: blogClientPlugin() }} auth={auth}>
			<section data-benchmark="content">
				<PostPage slug="benchmark" />
			</section>
		</Shell>
	);
}
