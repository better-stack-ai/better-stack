"use client";

import { File } from "lucide-react";
import { usePluginOverrides, useStack } from "@btst/stack/context";
import type { SerializedAsset } from "../../../types";
import type { MediaPluginOverrides } from "../../overrides";
import { MEDIA_PLUGIN_ID } from "../../constants";
import { isImage } from "./utils";

/** Asset data for a library thumbnail; selection and asset actions remain package-owned. */
export interface AssetThumbnailProps {
	asset: SerializedAsset;
}

export function AssetThumbnail({
	page,
	...props
}: AssetThumbnailProps & { page?: "library" }) {
	const { pageOverrides } = usePluginOverrides<
		MediaPluginOverrides,
		Partial<MediaPluginOverrides>
	>(MEDIA_PLUGIN_ID, {});
	const Thumbnail =
		(page ? pageOverrides?.[page]?.AssetThumbnail : undefined) ??
		DefaultAssetThumbnail;
	return <Thumbnail {...props} />;
}

function DefaultAssetThumbnail({ asset }: AssetThumbnailProps) {
	const { router } = useStack();
	const ImageComponent = router?.Image;
	return (
		<div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted">
			{isImage(asset.mimeType) ? (
				ImageComponent ? (
					<ImageComponent
						src={asset.url}
						alt={asset.alt || asset.originalName}
						className="h-full w-full object-cover"
						width={160}
						height={80}
					/>
				) : (
					<img
						src={asset.url}
						alt={asset.alt || asset.originalName}
						className="h-full w-full object-cover"
						loading="lazy"
					/>
				)
			) : (
				<File className="size-8 text-muted-foreground" />
			)}
		</div>
	);
}
