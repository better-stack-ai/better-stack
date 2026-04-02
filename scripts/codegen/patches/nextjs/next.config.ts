import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactCompiler: false,
	env: {
		// Expose whether an OpenAI key is set so the AI chat banner can check it client-side
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
};

export default nextConfig;
