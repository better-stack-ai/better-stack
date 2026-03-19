import { useState, useCallback, useRef } from "react";
import { useUploadAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { matchesAccept } from "./utils";

export function UploadTab({
	folderId,
	accept,
	onUploaded,
}: {
	folderId: string | null;
	accept?: string[];
	onUploaded: (asset: SerializedAsset) => void;
}) {
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
						setError(`File type ${file.type} is not accepted.`);
						continue;
					}
					const asset = await uploadAsset({
						file,
						folderId: folderId ?? undefined,
					});
					onUploaded(asset);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Upload failed");
			} finally {
				setUploading(false);
			}
		},
		[accept, folderId, uploadAsset, onUploaded],
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
					"flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors",
					dragging ? "border-ring bg-ring/5" : "border-muted-foreground/30",
				)}
			>
				{uploading ? (
					<>
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
						<p className="text-sm text-muted-foreground">Uploading…</p>
					</>
				) : (
					<>
						<Upload className="size-8 text-muted-foreground" />
						<div className="text-center">
							<p className="text-sm font-medium">Drop files here</p>
							<p className="text-xs text-muted-foreground">
								or click to browse
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => fileInputRef.current?.click()}
						>
							Choose files
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
