/** Versions verified together for this CLI release. */
export const TESTED_INSTALLATION_SET = {
	"@btst/plugin-search": "1.0.0-beta.0",
	"@btst/plugin-notifications": "1.0.0",
	"@btst/plugin-feedback": "1.0.0",
	"@btst/plugin-route-docs": "1.0.0",

	"@btst/plugin-feature-flags": "1.1.0",

	"@btst/plugin-calendar": "1.2.0",
	"@btst/plugin-helpdesk": "1.0.0-beta.0",

	"@btst/plugin-open-api": "1.0.0",
	"@btst/plugin-analytics": "1.1.0",
	"@btst/plugin-affiliate": "1.1.0",

	"@btst/plugin-comments": "1.0.0",

	"@btst/plugin-newsletter": "1.1.0",
	"@btst/plugin-blog": "1.0.0",
	"@btst/plugin-school": "2.1.0",
	"@btst/plugin-crm": "1.0.0",
	"@btst/stack": "6.1.0",
	"@btst/plugin-job-board": "1.0.0",
	"@btst/plugin-ecommerce": "1.1.0",

	"@btst/plugin-form-builder": "1.1.0",
	"@btst/plugin-ai-chat": "1.0.0",
	"@btst/plugin-media": "1.0.0",

	"@btst/plugin-kanban": "1.0.0",
	"@btst/plugin-cms": "1.1.0",
	"@btst/plugin-ui-builder": "1.0.0",
} as const;

export function testedPackageSpec(name: keyof typeof TESTED_INSTALLATION_SET) {
	return `${name}@${TESTED_INSTALLATION_SET[name]}`;
}
