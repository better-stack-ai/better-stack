import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async redirects() {
		return [
			{ source: "/", destination: "/pages/form-builder", permanent: false },
		];
	},
};

export default nextConfig;
