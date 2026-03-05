import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async redirects() {
		return [
			{ source: "/", destination: "/pages/ui-builder", permanent: false },
		];
	},
};

export default nextConfig;
