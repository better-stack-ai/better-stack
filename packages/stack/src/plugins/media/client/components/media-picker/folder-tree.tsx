import { useMemo, useState } from "react";
import {
	useFolders,
	useDeleteFolder,
	useCreateFolderForm,
} from "../../hooks/use-media";
import type { SerializedFolder } from "../../../types";
import { FolderPlus } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Check, Folder, Trash2, ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { PermissionAccess, useNotify, useTranslate } from "@btst/stack/context";
import { mediaPermissions } from "../../../permissions";

export function FolderTree({
	selectedId,
	onSelect,
}: {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}) {
	const t = useTranslate();
	const notify = useNotify();
	const { data: foldersRaw = [] } = useFolders();
	const folders = foldersRaw as import("../../../types").SerializedFolder[];
	const { foldersById, foldersByParent } = useMemo(() => {
		const byId = new Map<string, SerializedFolder>();
		const byParent = new Map<string | null, SerializedFolder[]>();
		for (const folder of folders) {
			byId.set(folder.id, folder);
			const parentId = folder.parentId ?? null;
			const siblings = byParent.get(parentId) ?? [];
			siblings.push(folder);
			byParent.set(parentId, siblings);
		}
		return { foldersById: byId, foldersByParent: byParent };
	}, [folders]);
	const rootFolders = foldersByParent.get(null) ?? [];
	const selectedFolder = selectedId ? foldersById.get(selectedId) : undefined;
	const [newFolderName, setNewFolderName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const { mutateAsync: deleteFolder } = useDeleteFolder();
	const createPermission = mediaPermissions.folder.create({
		...(selectedId ? { parentId: selectedId } : {}),
	});
	const createFolderForm = useCreateFolderForm({
		parentId: selectedId ?? undefined,
		onSuccess: () => {
			setNewFolderName("");
			setIsCreating(false);
		},
	});

	const handleCreateFolder = async () => {
		const name = newFolderName.trim();
		if (!name) return;
		await createFolderForm.submit({ name });
	};

	const handleDeleteFolder = async () => {
		if (!selectedId) return;
		if (
			!confirm(
				t(
					"media.folders.deleteConfirm",
					"Delete this folder? Assets inside will be unaffected.",
				),
			)
		)
			return;
		try {
			await deleteFolder(selectedId);
			onSelect(null);
			notify.success(t("media.toasts.folderDeleteSuccess", "Folder deleted"));
		} catch (error) {
			notify.error(
				error instanceof Error
					? error.message
					: t("media.toasts.folderDeleteError", "Failed to delete folder"),
			);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between px-2 py-2">
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("media.folders.title", "Folders")}
				</span>
				<PermissionAccess
					permission={createPermission}
					legacyPermission={{ resource: "media:folder", action: "create" }}
				>
					<button
						type="button"
						title={t("media.folders.new", "New folder")}
						onClick={() => setIsCreating((v) => !v)}
						className="rounded p-0.5 hover:bg-muted"
					>
						<FolderPlus className="size-3.5 text-muted-foreground" />
					</button>
				</PermissionAccess>
			</div>

			{isCreating && (
				<PermissionAccess
					permission={createPermission}
					legacyPermission={{ resource: "media:folder", action: "create" }}
				>
					<div className="flex gap-1 px-2 pb-1">
						<Input
							autoFocus
							value={newFolderName}
							onChange={(e) => {
								setNewFolderName(e.target.value);
								createFolderForm.clearErrors();
							}}
							placeholder={t("media.folders.namePlaceholder", "Folder name")}
							className="h-6 text-xs"
							onKeyDown={(e) => {
								if (e.key === "Enter") void handleCreateFolder();
								if (e.key === "Escape") setIsCreating(false);
							}}
						/>
						<button
							type="button"
							onClick={handleCreateFolder}
							disabled={createFolderForm.isSubmitting || !newFolderName.trim()}
							title={t("media.folders.create", "Create folder")}
							className="rounded px-1 py-0.5 text-xs hover:bg-muted"
						>
							<Check className="size-3" />
						</button>
						{createFolderForm.fieldErrors.name ? (
							<p className="text-xs text-destructive">
								{String(createFolderForm.fieldErrors.name)}
							</p>
						) : null}
					</div>
				</PermissionAccess>
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
					<span className="truncate">
						{t("media.folders.allFiles", "All files")}
					</span>
				</button>

				{rootFolders.map((folder) => (
					<FolderTreeItem
						key={folder.id}
						folder={folder}
						foldersByParent={foldersByParent}
						selectedId={selectedId}
						onSelect={onSelect}
					/>
				))}
			</div>

			{selectedId && selectedFolder && (
				<PermissionAccess
					permission={mediaPermissions.folder.delete({
						folderId: selectedId,
						...(selectedFolder.parentId
							? { parentId: selectedFolder.parentId }
							: {}),
					})}
					legacyPermission={{
						resource: "media:folder",
						action: "delete",
						params: {
							id: selectedId,
							...(selectedFolder.parentId
								? { parentId: selectedFolder.parentId }
								: {}),
						},
					}}
				>
					<div className="border-t px-2 py-1">
						<button
							type="button"
							onClick={() => void handleDeleteFolder()}
							className="flex items-center gap-1 text-xs text-destructive hover:underline"
						>
							<Trash2 className="size-3" />
							{t("media.folders.delete", "Delete folder")}
						</button>
					</div>
				</PermissionAccess>
			)}
		</div>
	);
}

export function FolderTreeItem({
	folder,
	foldersByParent,
	selectedId,
	onSelect,
	depth = 0,
}: {
	folder: SerializedFolder;
	foldersByParent: ReadonlyMap<string | null, readonly SerializedFolder[]>;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	depth?: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const children = foldersByParent.get(folder.id) ?? [];

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
						foldersByParent={foldersByParent}
						selectedId={selectedId}
						onSelect={onSelect}
						depth={depth + 1}
					/>
				))}
		</div>
	);
}
