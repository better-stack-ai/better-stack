import { useDeleteAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { cn } from "@workspace/ui/lib/utils";
import { File, Check, Copy, Trash2 } from "lucide-react";
import { isImage, formatBytes } from "./utils";
import { useCan, useNotify, useStack, useTranslate } from "@btst/stack/context";
import { AssetPreviewButton } from "./asset-preview-button";

export function AssetCard({
	asset,
	onToggle,
	selected = false,
	onDelete,
}: {
	asset: SerializedAsset;
	selected?: boolean;
	onToggle?: () => void;
	onDelete?: (id: string) => void | Promise<void>;
}) {
	const t = useTranslate();
	const notify = useNotify();
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const { can: canDelete } = useCan({
		resource: "media:asset",
		action: "delete",
		params: { id: asset.id },
	});
	const { api, router } = useStack();
	const ImageComponent = router?.Image;
	const imageAsset = isImage(asset.mimeType);
	const selectable = typeof onToggle === "function";

	const copyUrl = async () => {
		let fullUrl: string;
		try {
			fullUrl = new URL(asset.url, api?.baseURL).href;
		} catch {
			fullUrl = asset.url;
		}
		try {
			await navigator.clipboard.writeText(fullUrl);
			notify.success(t("media.toasts.copySuccess", "URL copied"));
		} catch {
			notify.error(t("media.toasts.copyError", "Failed to copy URL"));
		}
	};

	const handleDelete = async () => {
		if (!canDelete) return;
		if (onDelete) {
			await onDelete(asset.id);
			return;
		}

		if (
			confirm(
				t("media.assets.deleteNamedConfirm", 'Delete "{{filename}}"?', {
					filename: asset.originalName,
				}),
			)
		) {
			try {
				await deleteAsset(asset.id);
				notify.success(t("media.toasts.deleteSuccess", "Asset deleted"));
			} catch (error) {
				notify.error(
					error instanceof Error
						? error.message
						: t("media.toasts.deleteError", "Delete failed"),
				);
			}
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
				{api?.baseURL ? (
					<button
						type="button"
						title={t("media.actions.copyUrl", "Copy URL")}
						onClick={(e) => {
							e.stopPropagation();
							void copyUrl();
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
				{canDelete ? (
					<button
						type="button"
						title={t("media.actions.delete", "Delete")}
						onClick={(e) => {
							e.stopPropagation();
							void handleDelete();
						}}
						className="rounded bg-destructive/80 p-0.5 text-white hover:bg-destructive"
					>
						<Trash2 className="size-3" />
					</button>
				) : null}
			</div>
		</div>
	);
}
