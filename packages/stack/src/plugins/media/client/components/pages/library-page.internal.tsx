"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDeleteAsset, useUploadAsset } from "../../hooks/use-media";
import { Button } from "@workspace/ui/components/button";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
	useNotify,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { useListState, type ListStateSchema } from "@btst/stack/client/hooks";
import type { MediaPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { BrowseTab } from "../media-picker/browse-tab";
import { FolderTree } from "../media-picker/folder-tree";
import { MediaUploadPermissionCheck } from "../upload-permission-check";

export function LibraryPage() {
	const t = useTranslate();
	const notify = useNotify();
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
	});

	const [{ folder, q: search }, setListState] = useListState("media-library", {
		folder: { type: "string", default: "" },
		q: { type: "string", default: "", history: "replace" },
	} as const satisfies ListStateSchema);
	const selectedFolder = folder || null;
	const [searchInput, setSearchInput] = useState(search);
	const lastSyncedSearch = useRef(search);

	useEffect(() => {
		if (search !== lastSyncedSearch.current) {
			lastSyncedSearch.current = search;
			setSearchInput(search);
		}
	}, [search]);

	useEffect(() => {
		if (searchInput === search) return;
		const timeout = setTimeout(() => {
			lastSyncedSearch.current = searchInput;
			setListState({ q: searchInput });
		}, 300);
		return () => clearTimeout(timeout);
	}, [searchInput, search, setListState]);

	const setSelectedFolder = useCallback(
		(id: string | null) => setListState({ folder: id ?? "" }),
		[setListState],
	);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { mutateAsync: uploadAsset, isPending: isUploading } = useUploadAsset();
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const handleUpload = useCallback(
		async (files: FileList | File[]) => {
			const arr = Array.from(files);
			for (const file of arr) {
				try {
					await uploadAsset({ file, folderId: selectedFolder ?? undefined });
					notify.success(
						t("media.toasts.uploadSuccess", "Uploaded {{filename}}", {
							filename: file.name,
						}),
					);
				} catch (err) {
					notify.error(
						err instanceof Error
							? err.message
							: t("media.toasts.uploadError", "Upload failed"),
					);
				}
			}
		},
		[notify, selectedFolder, t, uploadAsset],
	);

	const handleDelete = async (id: string) => {
		if (!confirm(t("media.assets.deleteConfirm", "Delete this asset?"))) return;
		try {
			await deleteAsset(id);
			notify.success(t("media.toasts.deleteSuccess", "Asset deleted"));
		} catch (err) {
			notify.error(
				err instanceof Error
					? err.message
					: t("media.toasts.deleteError", "Delete failed"),
			);
		}
	};

	return (
		<MediaUploadPermissionCheck
			mode={overrides.uploadMode ?? "direct"}
			folderId={selectedFolder ?? undefined}
		>
			{({ can: canUpload, isPending, error }) => {
				if (error) throw error;
				const uploadAllowed = canUpload && !isPending;
				return (
					<div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden md:flex-row">
						<div className="max-h-48 shrink-0 overflow-hidden border-b bg-muted/20 md:h-full md:max-h-none md:w-52 md:border-b-0 md:border-r">
							<FolderTree
								selectedId={selectedFolder}
								onSelect={setSelectedFolder}
							/>
						</div>

						<div
							className={cn(
								"relative flex flex-1 flex-col overflow-hidden border-t md:border-t-0",
								dragging && "ring-2 ring-inset ring-ring",
							)}
							onDragOver={(e) => {
								if (!uploadAllowed) return;
								e.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={(e) => {
								if (!uploadAllowed) return;
								e.preventDefault();
								setDragging(false);
								void handleUpload(e.dataTransfer.files);
							}}
						>
							{/* Toolbar */}
							<div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
								{uploadAllowed ? (
									<>
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
											{t("media.actions.upload", "Upload")}
										</Button>
										<input
											ref={fileInputRef}
											type="file"
											multiple
											className="hidden"
											onChange={(e) =>
												e.target.files && handleUpload(e.target.files)
											}
										/>
									</>
								) : null}
							</div>

							{/* Drop overlay */}
							{dragging && uploadAllowed && (
								<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80">
									<div className="rounded-lg border-2 border-dashed border-ring p-8 text-center">
										<Upload className="mx-auto mb-2 size-10 text-ring" />
										<p className="font-medium">
											{t("media.upload.dropFiles", "Drop files to upload")}
										</p>
									</div>
								</div>
							)}

							<div className="flex-1 min-h-0 p-3 sm:p-4">
								<BrowseTab
									folderId={selectedFolder}
									search={searchInput}
									searchQuery={search}
									onSearchChange={setSearchInput}
									onDelete={handleDelete}
									emptyMessage={t(
										"media.assets.emptyLibrary",
										"No files yet. Drag & drop or click Upload.",
									)}
								/>
							</div>
						</div>
					</div>
				);
			}}
		</MediaUploadPermissionCheck>
	);
}
