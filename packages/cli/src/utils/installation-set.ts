/** Versions verified together for this CLI release. */
export const TESTED_INSTALLATION_SET = {
	"@btst/stack": "6.0.0",
	"@btst/plugin-ai-chat": "1.0.0",
	"@btst/plugin-cms": "1.0.0",
	"@btst/plugin-ui-builder": "1.0.0",
} as const;

export function testedPackageSpec(name: keyof typeof TESTED_INSTALLATION_SET) {
	return `${name}@${TESTED_INSTALLATION_SET[name]}`;
}
