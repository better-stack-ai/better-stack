import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_HAS_OPENAI_KEY: process.env.OPENAI_API_KEY ? "1" : "",
	},
};

export default nextConfig;
