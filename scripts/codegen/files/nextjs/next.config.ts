import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	env: {
		// Expose whether an OpenAI key is set so the pages layout can show a banner.
		NEXT_PUBLIC_HAS_OPENAI_KEY: process.env.OPENAI_API_KEY ? "1" : "",
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*",
			},
			{
				// Capture-only E2E app: direct Media uploads resolve against its local API.
				protocol: "http",
				hostname: "localhost",
				port: "3006",
				pathname: "/uploads/**",
			},
		],
	},
};

export default nextConfig;
