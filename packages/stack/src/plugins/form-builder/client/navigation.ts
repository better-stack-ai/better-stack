"use client";

import { normalizePath } from "@btst/stack/client";
import { useStack } from "@btst/stack/context";
import { FORM_BUILDER_PLUGIN_ID } from "./constants";

/** Resolve Form Builder page links from the registered plugin site endpoint. */
export function useFormBuilderSiteLocation() {
	const { basePath, plugins, router, site: stackSite } = useStack();
	const site = plugins?.[FORM_BUILDER_PLUGIN_ID]?.site;
	const siteBasePath = site?.basePath ?? basePath;
	const crossOrigin =
		Boolean(site?.baseURL) &&
		Boolean(stackSite?.baseURL) &&
		site?.baseURL !== stackSite?.baseURL;

	const resolve = (...segments: string[]) => {
		const path = normalizePath([siteBasePath, ...segments].join("/"));
		const href = site?.baseURL ? `${site.baseURL}${path}` : path;
		return { path, href: crossOrigin ? href : path, crossOrigin };
	};

	const navigate = (...segments: string[]) => {
		const location = resolve(...segments);
		if (location.crossOrigin && typeof window !== "undefined") {
			window.location.assign(location.href);
			return;
		}
		if (!router?.navigate && typeof window !== "undefined") {
			window.location.assign(location.href);
			return;
		}
		return router?.navigate?.(location.path);
	};

	return {
		Link: crossOrigin ? "a" : (router?.Link ?? "a"),
		navigate,
		resolve,
	};
}
