"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { post, contentTypes, boards } from "./data";

export function Shell({
	children,
	plugins,
	auth,
}: {
	children: React.ReactNode;
	plugins: Record<string, any>;
	auth?: any;
}) {
	const [count, setCount] = useState(0);
	const [queryClient] = useState(() => {
		const query = new QueryClient({
			defaultOptions: { queries: { staleTime: Infinity, retry: false } },
		});
		query.setQueryData(["posts", "detail", "benchmark"], post);
		query.setQueryData(["tags", "list", "tags"], []);
		query.setQueryData(["cmsTypes", "list", "list"], contentTypes);
		query.setQueryData(["boards", "list", { limit: 50, offset: 0 }], {
			items: boards,
			total: 1,
		});
		query.setQueryData(
			[
				"boards",
				"list",
				{ limit: 50, offset: 0 },
				{ identity: { id: "benchmark-user" } },
			],
			{ items: boards, total: 1 },
		);
		return query;
	});
	const [stack] = useState(() =>
		createClientStack({
			api: {
				baseURL:
					typeof window === "undefined"
						? "http://127.0.0.1:3210"
						: window.location.origin,
				basePath: "/api",
			},
			site: {
				baseURL:
					typeof window === "undefined"
						? "http://127.0.0.1:3210"
						: window.location.origin,
				basePath: "/",
			},
			queryClient,
			plugins,
		}),
	);
	useEffect(() => {
		performance.mark("benchmark-hydrated");
		document.documentElement.dataset.hydrated = "true";
	}, []);
	return (
		<StackProvider
			stack={stack}
			auth={auth}
			initialIdentity={auth ? { id: "benchmark-user" } : null}
			router={{
				navigate: (href) => {
					location.href = href;
				},
			}}
		>
			<nav>
				{["core", "reader", "editor", "multi"].map((route) => (
					<Link key={route} prefetch={false} href={`/${route}`}>
						{route}
					</Link>
				))}
			</nav>
			<main>
				<button
					data-benchmark="counter"
					type="button"
					onClick={() => setCount(count + 1)}
				>
					Interaction counter: {count}
				</button>
				{children}
			</main>
		</StackProvider>
	);
}
