"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import { interpolate } from "../shared/interpolate";
import type { StackI18nProvider } from "../shared/i18n-types";

const I18nContext = createContext<StackI18nProvider | null>(null);

export function StackI18nBoundary({
	i18n,
	children,
}: {
	i18n?: StackI18nProvider;
	children?: React.ReactNode;
}) {
	return (
		<I18nContext.Provider value={i18n ?? null}>{children}</I18nContext.Provider>
	);
}

export type TranslateFn = (
	key: string,
	defaultValue: string,
	params?: Record<string, unknown>,
) => string;

/**
 * Returns a `t(key, defaultValue, params?)` function for translatable UI strings.
 *
 * Without an `i18n` provider on `StackProvider`, returns the default English
 * string with `{{param}}` interpolation — identical to hardcoded strings today.
 *
 * @example
 * ```tsx
 * const t = useTranslate();
 * return <button>{t("blog.posts.create", "Create Post")}</button>;
 * ```
 */
export function useTranslate(): TranslateFn {
	const i18n = useContext(I18nContext);

	const fallback = useCallback<TranslateFn>(
		(key, defaultValue, params) => interpolate(defaultValue, params),
		[],
	);

	return useMemo(() => {
		if (!i18n) return fallback;

		return (key, defaultValue, params) =>
			i18n.translate(key, defaultValue, params);
	}, [i18n, fallback]);
}

/** @internal Access the raw i18n provider (or `null` when none is set). */
export function useI18nContext(): StackI18nProvider | null {
	return useContext(I18nContext);
}
