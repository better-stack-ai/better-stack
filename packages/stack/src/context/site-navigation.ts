"use client";

import { normalizePath } from "../client/path-utils";
import { useStack } from "./provider";

/**
 * Resolve one registered plugin's page links and programmatic navigation.
 *
 * Uses the plugin's resolved site endpoint, including per-plugin overrides.
 * Same-origin destinations use the configured router; cross-origin destinations
 * and stacks without a router use full-page browser navigation.
 */
export function usePluginSiteNavigation(pluginId: string) {
	const { basePath, plugins, router, site: stackSite } = useStack();
	const pluginSite = plugins?.[pluginId]?.site;
	const siteBasePath = pluginSite?.basePath ?? basePath;
	const crossOrigin =
		Boolean(pluginSite?.baseURL) &&
		Boolean(stackSite?.baseURL) &&
		pluginSite?.baseURL !== stackSite?.baseURL;

	const resolve = (...segments: string[]) => {
		const path = normalizePath([siteBasePath, ...segments].join("/"));
		const absoluteHref = pluginSite?.baseURL
			? `${pluginSite.baseURL}${path}`
			: path;
		return {
			path,
			href: crossOrigin ? absoluteHref : path,
			crossOrigin,
		};
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
