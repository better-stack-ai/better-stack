import type { NextConfig } from "next"

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
		],
	},
}

export default nextConfig
