import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async redirects() {
		return [{ source: "/", destination: "/pages/cms", permanent: false }];
	},
};

export default nextConfig;
