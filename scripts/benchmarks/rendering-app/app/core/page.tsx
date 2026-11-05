"use client";
import { defineClientPlugin, createRoute } from "@btst/stack/plugins/client";
import { Shell } from "../shell";

const plugin = defineClientPlugin<{ label: string }>()({
	id: "benchmark",
	resolve: () => ({
		routes: () => ({
			home: createRoute("/core", () => ({
				PageComponent: () => <h1>BTST core workspace</h1>,
			})),
		}),
	}),
});
export default function Page() {
	return (
		<Shell plugins={{ benchmark: plugin }}>
			<h1 data-benchmark="content">BTST core workspace</h1>
			<p>A shared runtime with an application-owned plugin.</p>
		</Shell>
	);
}
