import { useState } from "react";
import {
	useFolders,
	useCreateFolder,
	useDeleteFolder,
} from "../../hooks/use-media";
import type { SerializedFolder } from "../../../types";
import { FolderPlus } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Check, Folder, Trash2, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export function FolderTree({
	selectedId,
	onSelect,
}: {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}) {
	const { data: rootFoldersRaw = [] } = useFolders(null);
	const rootFolders =
		rootFoldersRaw as import("../../../types").SerializedFolder[];
	const [newFolderName, setNewFolderName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const { mutateAsync: createFolder } = useCreateFolder();
	const { mutateAsync: deleteFolder } = useDeleteFolder();

	const handleCreateFolder = async () => {
		const name = newFolderName.trim();
		if (!name) return;
		try {
			await createFolder({ name, parentId: selectedId ?? undefined });
			setNewFolderName("");
			setIsCreating(false);
		} catch (err) {
			console.error("[btst/media] Failed to create folder", err);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between px-2 py-2">
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Folders
				</span>
				<button
					type="button"
					title="New folder"
					onClick={() => setIsCreating((v) => !v)}
					className="rounded p-0.5 hover:bg-muted"
				>
					<FolderPlus className="size-3.5 text-muted-foreground" />
				</button>
			</div>

			{isCreating && (
				<div className="flex gap-1 px-2 pb-1">
					<Input
						autoFocus
						value={newFolderName}
						onChange={(e) => setNewFolderName(e.target.value)}
						placeholder="Folder name"
						className="h-6 text-xs"
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleCreateFolder();
							if (e.key === "Escape") setIsCreating(false);
						}}
					/>
					<button
						type="button"
						onClick={handleCreateFolder}
						className="rounded px-1 py-0.5 text-xs hover:bg-muted"
					>
						<Check className="size-3" />
					</button>
				</div>
			)}

			<div className="flex-1 overflow-y-auto overscroll-contain">
				{/* All assets (root) */}
				<button
					type="button"
					onClick={() => onSelect(null)}
					className={cn(
						"flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-muted",
						selectedId === null && "bg-muted font-medium",
					)}
				>
					<span className="size-3" />
					<Folder className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate">All files</span>
				</button>

				{rootFolders.map((folder) => (
					<FolderTreeItem
						key={folder.id}
						folder={folder}
						selectedId={selectedId}
						onSelect={onSelect}
					/>
				))}
			</div>

			{selectedId && (
				<div className="border-t px-2 py-1">
					<button
						type="button"
						onClick={async () => {
							if (
								confirm("Delete this folder? Assets inside will be unaffected.")
							) {
								try {
									await deleteFolder(selectedId);
									onSelect(null);
								} catch (err) {
									console.error("[btst/media] Failed to delete folder", err);
								}
							}
						}}
						className="flex items-center gap-1 text-xs text-destructive hover:underline"
					>
						<Trash2 className="size-3" />
						Delete folder
					</button>
				</div>
			)}
		</div>
	);
}

export function FolderTreeItem({
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
	const { data: children = [] } = useFolders(folder.id);

	return (
		<div>
			<button
				type="button"
				onClick={() => {
					onSelect(folder.id);
					setExpanded((v) => !v);
				}}
				className={cn(
					"flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-muted",
					selectedId === folder.id && "bg-muted font-medium",
				)}
				style={{ paddingLeft: `${8 + depth * 12}px` }}
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
