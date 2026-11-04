import { useState, useCallback, useRef } from "react";
import { useUploadAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { matchesAccept } from "./utils";
import { useNotify, useTranslate } from "@btst/stack/context";

export function UploadTab({
	folderId,
	accept,
	onUploaded,
}: {
	folderId: string | null;
	accept?: string[];
	onUploaded: (asset: SerializedAsset) => void;
}) {
	const t = useTranslate();
	const notify = useNotify();
	const [dragging, setDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { mutateAsync: uploadAsset } = useUploadAsset();

	const acceptAttr = accept?.join(",") ?? undefined;

	const handleFiles = useCallback(
		async (files: FileList | File[]) => {
			const fileArr = Array.from(files);
			if (fileArr.length === 0) return;
			setError(null);
			setUploading(true);
			try {
				for (const file of fileArr) {
					if (accept && !matchesAccept(file.type, accept)) {
						setError(
							t(
								"media.upload.invalidType",
								"File type {{type}} is not accepted.",
								{
									type: file.type,
								},
							),
						);
						continue;
					}
					const asset = await uploadAsset({
						file,
						folderId: folderId ?? undefined,
					});
					onUploaded(asset);
					notify.success(
						t("media.toasts.uploadSuccess", "Uploaded {{filename}}", {
							filename: file.name,
						}),
					);
				}
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: t("media.toasts.uploadError", "Upload failed"),
				);
			} finally {
				setUploading(false);
			}
		},
		[accept, folderId, notify, onUploaded, t, uploadAsset],
	);

	return (
		<div className="flex h-full flex-col gap-3">
			<div
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					void handleFiles(e.dataTransfer.files);
				}}
				className={cn(
					"flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors sm:px-6",
					dragging ? "border-ring bg-ring/5" : "border-muted-foreground/30",
				)}
			>
				{uploading ? (
					<>
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							{t("media.upload.uploading", "Uploading…")}
						</p>
					</>
				) : (
					<>
						<Upload className="size-8 text-muted-foreground" />
						<div className="text-center">
							<p className="text-sm font-medium">
								{t("media.upload.dropHere", "Drop files here")}
							</p>
							<p className="text-xs text-muted-foreground">
								{t("media.upload.orBrowse", "or click to browse")}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
						>
							{t("media.upload.chooseFiles", "Choose files")}
						</Button>
					</>
				)}
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<input
				ref={fileInputRef}
				type="file"
				accept={acceptAttr}
				multiple
				className="hidden"
				data-testid="media-upload-input"
				onChange={(e) => e.target.files && handleFiles(e.target.files)}
			/>
		</div>
	);
}
