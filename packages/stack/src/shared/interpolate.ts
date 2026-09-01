/**
 * Replace `{{key}}` placeholders in a template with stringified param values.
 */
export function interpolate(
	template: string,
	params?: Record<string, unknown>,
): string {
	if (!params) return template;

	return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
		const value = params[key];
		return value == null ? "" : String(value);
	});
}
