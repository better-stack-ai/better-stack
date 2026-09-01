/**
 * Optional i18n provider, passed to `StackProvider` via the `i18n` prop.
 *
 * Without a provider, `useTranslate()` returns the default English string with
 * `{{param}}` interpolation — zero setup cost for English-only apps.
 *
 * @example
 * ```tsx
 * const i18n: StackI18nProvider = {
 *   translate: (key, defaultValue, params) =>
 *     t(key, { defaultValue, ...params }),
 * };
 *
 * <StackProvider i18n={i18n} ...>
 * ```
 */
export interface StackI18nProvider {
	/**
	 * Translate a namespaced key. Receives the English default and optional
	 * interpolation params when no translation exists for the key.
	 */
	translate: (
		key: string,
		defaultValue: string,
		params?: Record<string, unknown>,
	) => string;
	/** Return the active locale (optional) */
	getLocale?: () => string;
	/** Switch locale (optional) */
	changeLocale?: (locale: string) => void;
}
