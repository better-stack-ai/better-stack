"use client";

import { normalizePath } from "@btst/stack/client";
import { useStack } from "@btst/stack/context";
import { KANBAN_PLUGIN_ID } from "./constants";

/** Resolve Kanban page links from the registered plugin site endpoint. */
export function useKanbanSiteLocation() {
	const { basePath, plugins, router } = useStack();
	const site = plugins?.[KANBAN_PLUGIN_ID]?.site;
	const siteBasePath = site?.basePath ?? basePath;

	const resolve = (...segments: string[]) => {
		const path = normalizePath([siteBasePath, ...segments].join("/"));
		const href = site?.baseURL ? `${site.baseURL}${path}` : path;
		const crossOrigin =
			typeof window !== "undefined" &&
			Boolean(site?.baseURL) &&
			new URL(href).origin !== window.location.origin;
		return { path, href: crossOrigin ? href : path, crossOrigin };
	};

	const navigate = (...segments: string[]) => {
		const location = resolve(...segments);
		if (location.crossOrigin && typeof window !== "undefined") {
			window.location.assign(location.href);
			return;
		}
		return router?.navigate?.(location.path);
	};

	return { Link: router?.Link ?? "a", navigate, resolve };
}
