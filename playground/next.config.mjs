/** @type {import('next').NextConfig} */
const config = {
	reactStrictMode: true,
	basePath: "/playground",
	assetPrefix: "/playground",
	serverExternalPackages: ["handlebars"],
	async headers() {
		return [
			{
				// COOP: same-origin + COEP: credentialless = cross-origin isolation.
				// Required for SharedArrayBuffer, which WebContainers (template: "node")
				// needs to boot. same-origin-allow-popups does NOT provide isolation.
				source: "/(.*)",
				headers: [
					{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
					{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
				],
			},
		];
	},
};

export default config;
