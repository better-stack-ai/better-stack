import { useDeleteAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { cn } from "@workspace/ui/lib/utils";
import { File, Check, Copy, Trash2 } from "lucide-react";
import { isImage, formatBytes } from "./utils";
import { usePluginOverrides } from "@btst/stack/context";
import type { MediaPluginOverrides } from "../../overrides";
import { AssetPreviewButton } from "./asset-preview-button";
import { toast } from "sonner";

export function AssetCard({
	asset,
	onToggle,
	selected = false,
	onDelete,
	apiBaseURL,
}: {
	asset: SerializedAsset;
	selected?: boolean;
	onToggle?: () => void;
	onDelete?: (id: string) => void | Promise<void>;
	apiBaseURL?: string;
}) {
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const { Image: ImageComponent } = usePluginOverrides<
		MediaPluginOverrides,
		Partial<MediaPluginOverrides>
	>("media", {});
	const imageAsset = isImage(asset.mimeType);
	const selectable = typeof onToggle === "function";

	const copyUrl = () => {
		let fullUrl: string;
		try {
			fullUrl = new URL(asset.url, apiBaseURL).href;
		} catch {
			fullUrl = asset.url;
		}
		navigator.clipboard
			.writeText(fullUrl)
			.then(() => toast.success("URL copied"));
	};

	const handleDelete = () => {
		if (onDelete) {
			return onDelete(asset.id);
		}

		if (confirm(`Delete "${asset.originalName}"?`)) {
			return deleteAsset(asset.id).catch(console.error);
		}
	};

	return (
		<div
			role={selectable ? "button" : undefined}
			tabIndex={selectable ? 0 : undefined}
			data-testid="media-asset-item"
			onClick={onToggle}
			onKeyDown={(e) => {
				if (selectable && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					onToggle();
				}
			}}
			className={cn(
				"group relative cursor-pointer rounded-md border bg-muted/30 p-1 transition-all hover:border-ring hover:shadow-sm",
				!selectable && "cursor-default",
				selected && "border-ring ring-1 ring-ring",
			)}
		>
			{/* Thumbnail */}
			<div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted">
				{imageAsset ? (
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

			<div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
				{apiBaseURL ? (
					<button
						type="button"
						title="Copy URL"
						onClick={(e) => {
							e.stopPropagation();
							copyUrl();
						}}
						className="rounded bg-background/80 p-0.5 shadow hover:bg-background"
					>
						<Copy className="size-3" />
					</button>
				) : null}
				{imageAsset ? (
					<AssetPreviewButton
						asset={asset}
						className="rounded bg-background/80 p-0.5 shadow hover:bg-background"
					/>
				) : null}
				<button
					type="button"
					title="Delete"
					onClick={(e) => {
						e.stopPropagation();
						void handleDelete();
					}}
					className="rounded bg-destructive/80 p-0.5 text-white hover:bg-destructive"
				>
					<Trash2 className="size-3" />
				</button>
			</div>
		</div>
	);
}
