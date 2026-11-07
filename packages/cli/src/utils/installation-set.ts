/** Versions verified together for this CLI release. */
export const TESTED_INSTALLATION_SET = {
	"@btst/plugin-search": "1.0.0-beta.2",
	"@btst/plugin-notifications": "1.1.0-beta.1",
	"@btst/plugin-feedback": "1.1.0-beta.1",
	"@btst/plugin-route-docs": "1.0.1-beta.1",

	"@btst/plugin-feature-flags": "1.2.0-beta.1",

	"@btst/plugin-calendar": "1.3.0-beta.1",
	"@btst/plugin-helpdesk": "1.0.0-beta.2",

	"@btst/plugin-open-api": "1.0.1-beta.1",
	"@btst/plugin-analytics": "1.2.0-beta.1",
	"@btst/plugin-affiliate": "1.1.1-beta.1",

	"@btst/plugin-comments": "1.1.0-beta.1",

	"@btst/plugin-newsletter": "1.2.0-beta.1",
	"@btst/plugin-blog": "1.1.0-beta.1",
	"@btst/plugin-school": "2.1.1-beta.1",
	"@btst/plugin-crm": "1.1.0-beta.1",
	"@btst/stack": "6.2.0-beta.1",
	"@btst/plugin-job-board": "1.1.0-beta.1",
	"@btst/plugin-ecommerce": "1.2.0-beta.1",

	"@btst/plugin-form-builder": "1.2.0-beta.1",
	"@btst/plugin-ai-chat": "1.1.0-beta.1",
	"@btst/plugin-media": "1.1.0-beta.1",

	"@btst/plugin-kanban": "1.1.0-beta.1",
	"@btst/plugin-cms": "1.2.0-beta.1",
	"@btst/plugin-ui-builder": "1.1.0-beta.1",
} as const;

export function testedPackageSpec(name: keyof typeof TESTED_INSTALLATION_SET) {
	return `${name}@${TESTED_INSTALLATION_SET[name]}`;
}
