import type { SerializedAsset } from "./types";

export function resolveMediaAsset(
	asset: SerializedAsset,
	apiBaseURL: string | undefined,
): SerializedAsset {
	if (!apiBaseURL) return asset;
	try {
		const url = new URL(asset.url, apiBaseURL).href;
		return url === asset.url ? asset : { ...asset, url };
	} catch {
		return asset;
	}
}
