"use client";
import { useState, useCallback, useRef } from "react";
import { useDeleteAsset, useUploadAsset } from "../../hooks/use-media";
import { Button } from "@workspace/ui/components/button";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { usePluginOverrides } from "@btst/stack/context";
import type { MediaPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { BrowseTab } from "../media-picker/browse-tab";
import { FolderTree } from "../media-picker/folder-tree";

export function LibraryPage() {
	const overrides = usePluginOverrides<
		MediaPluginOverrides,
		Partial<MediaPluginOverrides>
	>("media", {});

	useRouteLifecycle({
		routeName: "library",
		context: {
			path: "/media",
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeLibraryPageRendered) {
				return overrides.onBeforeLibraryPageRendered(context);
			}
			return true;
		},
	});

	const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { mutateAsync: uploadAsset, isPending: isUploading } = useUploadAsset();
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const { apiBaseURL = "" } = overrides;

	const handleUpload = useCallback(
		async (files: FileList | File[]) => {
			const arr = Array.from(files);
			for (const file of arr) {
				try {
					await uploadAsset({ file, folderId: selectedFolder ?? undefined });
					toast.success(`Uploaded ${file.name}`);
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Upload failed");
				}
			}
		},
		[selectedFolder, uploadAsset],
	);

	const handleDelete = async (id: string) => {
		if (!confirm("Delete this asset?")) return;
		try {
			await deleteAsset(id);
			toast.success("Deleted");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		}
	};

	return (
		<div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden md:flex-row">
			<div className="max-h-48 shrink-0 overflow-hidden border-b bg-muted/20 md:h-full md:max-h-none md:w-52 md:border-b-0 md:border-r">
				<FolderTree selectedId={selectedFolder} onSelect={setSelectedFolder} />
			</div>

			<div
				className={cn(
					"relative flex flex-1 flex-col overflow-hidden border-t md:border-t-0",
					dragging && "ring-2 ring-inset ring-ring",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					void handleUpload(e.dataTransfer.files);
				}}
			>
				{/* Toolbar */}
				<div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
					<Button
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
						className="w-full sm:w-auto"
					>
						{isUploading ? (
							<Loader2 className="mr-2 size-3.5 animate-spin" />
						) : (
							<Upload className="mr-2 size-3.5" />
						)}
						Upload
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(e) => e.target.files && handleUpload(e.target.files)}
					/>
				</div>

				{/* Drop overlay */}
				{dragging && (
					<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80">
						<div className="rounded-lg border-2 border-dashed border-ring p-8 text-center">
							<Upload className="mx-auto mb-2 size-10 text-ring" />
							<p className="font-medium">Drop files to upload</p>
						</div>
					</div>
				)}

				<div className="flex-1 min-h-0 p-3 sm:p-4">
					<BrowseTab
						folderId={selectedFolder}
						onDelete={handleDelete}
						apiBaseURL={apiBaseURL}
						emptyMessage="No files yet. Drag & drop or click Upload."
					/>
				</div>
			</div>
		</div>
	);
}
