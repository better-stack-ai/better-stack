import { useDeleteAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { cn } from "@workspace/ui/lib/utils";
import { File, Check, Trash2 } from "lucide-react";
import { isImage, formatBytes } from "./utils";
import { usePluginOverrides } from "@btst/stack/context";
import type { MediaPluginOverrides } from "../../overrides";

export function AssetCard({
	asset,
	selected,
	onToggle,
}: {
	asset: SerializedAsset;
	selected: boolean;
	onToggle: () => void;
}) {
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const { Image: ImageComponent } = usePluginOverrides<
		MediaPluginOverrides,
		Partial<MediaPluginOverrides>
	>("media", {});

	return (
		<div
			role="button"
			tabIndex={0}
			data-testid="media-asset-item"
			onClick={onToggle}
			onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
			className={cn(
				"group relative cursor-pointer rounded-md border bg-muted/30 p-1 transition-all hover:border-ring hover:shadow-sm",
				selected && "border-ring ring-1 ring-ring",
			)}
		>
			{/* Thumbnail */}
			<div className="flex h-20 items-center justify-center overflow-hidden rounded bg-muted">
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

			{/* Name + size */}
			<div className="mt-1 px-0.5">
				<p
					className="truncate text-xs font-medium leading-tight"
					title={asset.originalName}
				>
					{asset.originalName}
				</p>
				<p className="text-[10px] text-muted-foreground">
					{formatBytes(asset.size)}
				</p>
			</div>

			{/* Selection indicator */}
			{selected && (
				<div className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
					<Check className="size-3" />
				</div>
			)}

			{/* Delete button (on hover) */}
			<button
				type="button"
				title="Delete"
				onClick={(e) => {
					e.stopPropagation();
					if (confirm(`Delete "${asset.originalName}"?`)) {
						deleteAsset(asset.id).catch(console.error);
					}
				}}
				className="absolute left-1 top-1 hidden rounded bg-destructive/80 p-0.5 text-white group-hover:flex"
			>
				<Trash2 className="size-3" />
			</button>
		</div>
	);
}
