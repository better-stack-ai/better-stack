"use client";
import { useState, useCallback, useRef, type ComponentType } from "react";
import {
	useAssets,
	useDeleteAsset,
	useDeleteFolder,
	useFolders,
	useUploadAsset,
	useCreateFolder,
} from "../../hooks/use-media";
import type { SerializedAsset, SerializedFolder } from "../../../types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	Folder,
	FolderOpen,
	Image,
	File as FileIcon,
	Upload,
	Trash2,
	Search,
	X,
	ChevronRight,
	Loader2,
	FolderPlus,
	Check,
	Copy,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { usePluginOverrides } from "@btst/stack/context";
import type { MediaPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FolderTreeItem({
	folder,
	selectedId,
	onSelect,
	depth = 0,
}: {
	folder: SerializedFolder;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	depth?: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const { data: childrenRaw = [] } = useFolders(folder.id);
	const children = childrenRaw as SerializedFolder[];
	const { mutateAsync: deleteFolder } = useDeleteFolder();

	return (
		<div>
			<div
				className="group flex items-center"
				style={{ paddingLeft: `${8 + depth * 12}px` }}
			>
				<button
					type="button"
					onClick={() => {
						onSelect(folder.id);
						setExpanded((v) => !v);
					}}
					className={cn(
						"flex flex-1 items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-muted",
						selectedId === folder.id && "bg-muted font-medium",
					)}
				>
					{children.length > 0 ? (
						<ChevronRight
							className={cn(
								"size-3 shrink-0 transition-transform",
								expanded && "rotate-90",
							)}
						/>
					) : (
						<span className="size-3" />
					)}
					{expanded ? (
						<FolderOpen className="size-3.5 shrink-0 text-amber-500" />
					) : (
						<Folder className="size-3.5 shrink-0 text-amber-500" />
					)}
					<span className="truncate">{folder.name}</span>
				</button>
			</div>
			{expanded &&
				children.map((child) => (
					<FolderTreeItem
						key={child.id}
						folder={child}
						selectedId={selectedId}
						onSelect={onSelect}
						depth={depth + 1}
					/>
				))}
		</div>
	);
}

function LibrarySidebar({
	selectedFolder,
	onSelect,
}: {
	selectedFolder: string | null;
	onSelect: (id: string | null) => void;
}) {
	const { data: rootFoldersRaw = [] } = useFolders(null);
	const rootFolders = rootFoldersRaw as SerializedFolder[];
	const [newFolderName, setNewFolderName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const { mutateAsync: createFolder, isPending } = useCreateFolder();

	const handleCreate = async () => {
		const name = newFolderName.trim();
		if (!name) return;
		try {
			await createFolder({ name, parentId: selectedFolder ?? undefined });
			setNewFolderName("");
			setIsCreating(false);
			toast.success("Folder created");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create folder",
			);
		}
	};

	return (
		<div className="flex h-full flex-col border-r bg-muted/20 w-52 shrink-0">
			<div className="flex items-center justify-between px-3 py-3">
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Folders
				</span>
				<button
					type="button"
					onClick={() => setIsCreating((v) => !v)}
					title="New folder"
					className="rounded p-0.5 hover:bg-muted"
				>
					<FolderPlus className="size-3.5 text-muted-foreground" />
				</button>
			</div>
			{isCreating && (
				<div className="flex gap-1 px-2 pb-2">
					<Input
						autoFocus
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						placeholder="Folder name"
						className="h-7 text-xs"
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleCreate();
							if (e.key === "Escape") setIsCreating(false);
						}}
					/>
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7"
						onClick={handleCreate}
						disabled={isPending}
					>
						<Check className="size-3" />
					</Button>
				</div>
			)}
			<div className="flex-1 overflow-y-auto">
				<button
					type="button"
					onClick={() => onSelect(null)}
					className={cn(
						"flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-muted",
						selectedFolder === null && "bg-muted font-medium",
					)}
					style={{ paddingLeft: "8px" }}
				>
					<span className="size-3" />
					<Folder className="size-3.5 text-muted-foreground" />
					<span>All files</span>
				</button>
				{rootFolders.map((folder) => (
					<FolderTreeItem
						key={folder.id}
						folder={folder}
						selectedId={selectedFolder}
						onSelect={onSelect}
					/>
				))}
			</div>
		</div>
	);
}

function AssetCard({
	asset,
	onDelete,
	ImageComponent,
	apiBaseURL,
}: {
	asset: SerializedAsset;
	onDelete: (id: string) => void;
	ImageComponent?: ComponentType<
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, any>
	>;
	apiBaseURL: string;
}) {
	const isImg = asset.mimeType.startsWith("image/");

	const copyUrl = () => {
		let fullUrl: string;
		try {
			// new URL() handles both absolute and relative URLs and encodes
			// special characters (spaces, non-ASCII) in the path correctly.
			fullUrl = new URL(asset.url, apiBaseURL).href;
		} catch {
			fullUrl = asset.url;
		}
		navigator.clipboard
			.writeText(fullUrl)
			.then(() => toast.success("URL copied"));
	};

	return (
		<div className="group relative rounded-md border bg-muted/20 p-1.5 transition-all hover:border-ring hover:shadow-sm">
			<div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted">
				{isImg ? (
					ImageComponent ? (
						<ImageComponent
							src={asset.url}
							alt={asset.alt || asset.originalName}
							className="h-full w-full object-cover"
							width={200}
							height={112}
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
					<FileIcon className="size-10 text-muted-foreground" />
				)}
			</div>
			<div className="mt-1.5 px-0.5">
				<p
					className="truncate text-xs font-medium leading-tight"
					title={asset.originalName}
				>
					{asset.originalName}
				</p>
				<p className="text-[10px] text-muted-foreground">
					{asset.mimeType} · {formatBytes(asset.size)}
				</p>
				<p
					className="truncate text-[10px] text-muted-foreground"
					title={asset.url}
				>
					{asset.url}
				</p>
			</div>
			<div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
				<button
					type="button"
					title="Copy URL"
					onClick={copyUrl}
					className="rounded bg-background/80 p-0.5 shadow hover:bg-background"
				>
					<Copy className="size-3" />
				</button>
				<button
					type="button"
					title="Delete"
					onClick={() => onDelete(asset.id)}
					className="rounded bg-destructive/80 p-0.5 text-white hover:bg-destructive"
				>
					<Trash2 className="size-3" />
				</button>
			</div>
		</div>
	);
}

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
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { mutateAsync: uploadAsset, isPending: isUploading } = useUploadAsset();
	const { mutateAsync: deleteAsset } = useDeleteAsset();
	const { Image: ImageComponent, apiBaseURL = "" } = overrides;

	const handleSearch = (v: string) => {
		setSearch(v);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300);
	};

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		useAssets({
			folderId: selectedFolder ?? undefined,
			query: debouncedSearch || undefined,
			limit: 40,
		});

	const assets = data?.pages.flatMap((p) => p.items) ?? [];

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
		<div className="flex h-[calc(100vh-4rem)] overflow-hidden">
			<LibrarySidebar
				selectedFolder={selectedFolder}
				onSelect={setSelectedFolder}
			/>

			<div
				className={cn(
					"flex flex-1 flex-col overflow-hidden",
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
				<div className="flex items-center gap-3 border-b px-4 py-2">
					<div className="relative flex-1">
						<Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => handleSearch(e.target.value)}
							placeholder="Search files…"
							className="h-8 pl-8"
						/>
						{search && (
							<button
								type="button"
								onClick={() => {
									setSearch("");
									setDebouncedSearch("");
								}}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>
					<Button
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
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

				{/* Asset grid */}
				<div className="flex-1 overflow-y-auto p-4">
					{isLoading ? (
						<div className="flex h-full items-center justify-center">
							<Loader2 className="size-8 animate-spin text-muted-foreground" />
						</div>
					) : assets.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
							<Image className="size-12" />
							<p className="text-sm">
								No files yet. Drag &amp; drop or click Upload.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{assets.map((asset) => (
								<AssetCard
									key={asset.id}
									asset={asset}
									onDelete={handleDelete}
									ImageComponent={ImageComponent}
									apiBaseURL={apiBaseURL}
								/>
							))}
						</div>
					)}
					{hasNextPage && (
						<div className="flex justify-center py-4">
							<Button
								variant="outline"
								size="sm"
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage && (
									<Loader2 className="mr-2 size-3.5 animate-spin" />
								)}
								Load more
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
