"use client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import { NewPostPage } from "@btst/plugin-blog/client/components";
import "@btst/plugin-blog/css";
import { Shell } from "../shell";
import { auth } from "../blog-auth";
export default function Page() {
	return (
		<Shell plugins={{ blog: blogClientPlugin() }} auth={auth}>
			<section data-benchmark="content">
				<NewPostPage />
			</section>
		</Shell>
	);
}
