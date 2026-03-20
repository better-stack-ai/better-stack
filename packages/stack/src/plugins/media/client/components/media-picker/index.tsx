"use client";
import { useState, type ReactNode } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Button } from "@workspace/ui/components/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Image, Upload, Link, X } from "lucide-react";
import type { SerializedAsset } from "../../../types";
import { FolderTree } from "./folder-tree";
import { BrowseTab } from "./browse-tab";
import { UploadTab } from "./upload-tab";
import { UrlTab } from "./url-tab";
import type { MediaPluginOverrides } from "../../overrides";
import { usePluginOverrides } from "@btst/stack/context";

export interface MediaPickerProps {
	/**
	 * Element that triggers opening the picker. Required.
	 */
	trigger: ReactNode;
	/**
	 * Called when the user confirms their selection.
	 */
	onSelect: (assets: SerializedAsset[]) => void;
	/**
	 * Allow multiple selection.
	 * @default false
	 */
	multiple?: boolean;
	/**
	 * Filter displayed assets by MIME type prefix (e.g. "image/").
	 */
	accept?: string[];
}

/**
 * MediaPicker — a Popover-based media browser.
 *
 * Reads API config from the `media` plugin overrides context (set up in StackProvider).
 * Must be rendered inside a `StackProvider` that includes media overrides.
 *
 * @example
 * ```tsx
 * <MediaPicker
 *   trigger={<Button size="sm">Browse media</Button>}
 *   accept={["image/*"]}
 *   onSelect={(assets) => form.setValue("image", assets[0].url)}
 * />
 * ```
 */
export function MediaPicker({
	trigger,
	onSelect,
	multiple = false,
	accept,
}: MediaPickerProps) {
	const [open, setOpen] = useState(false);
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
	const [selectedAssets, setSelectedAssets] = useState<SerializedAsset[]>([]);
	const [activeTab, setActiveTab] = useState<"browse" | "upload" | "url">(
		"browse",
	);

	const handleClose = () => {
		setOpen(false);
		setSelectedAssets([]);
	};

	const handleConfirm = () => {
		if (selectedAssets.length === 0) return;
		// Copy selection before clearing; defer onSelect so the popover has time
		// to start its close animation before any parent state updates that might
		// unmount this component (e.g. CMSFileUpload hiding when previewUrl is set).
		const toSelect = [...selectedAssets];
		handleClose();
		setTimeout(() => onSelect(toSelect), 0);
	};

	const handleToggleAsset = (asset: SerializedAsset) => {
		if (multiple) {
			setSelectedAssets((prev) =>
				prev.some((a) => a.id === asset.id)
					? prev.filter((a) => a.id !== asset.id)
					: [...prev, asset],
			);
		} else {
			setSelectedAssets([asset]);
		}
	};

	const handleUploaded = (asset: SerializedAsset) => {
		if (multiple) {
			setSelectedAssets((prev) => [...prev, asset]);
		} else {
			setSelectedAssets([asset]);
			setActiveTab("browse");
		}
	};

	const handleUrlRegistered = (asset: SerializedAsset) => {
		// Close the popover first, then notify parent — same deferral as handleConfirm.
		const toSelect = asset;
		handleClose();
		setTimeout(() => onSelect([toSelect]), 0);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				if (!v) handleClose();
				else setOpen(true);
			}}
		>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				className="w-[900px] p-0"
				align="start"
				sideOffset={8}
				collisionPadding={16}
				style={{
					maxWidth: "min(900px, 95vw)",
					height: "min(550px, calc(100vh - 120px))",
				}}
			>
				<div className="flex h-full flex-col overflow-hidden rounded-md">
					{/* Header */}
					<div className="flex items-center justify-between border-b px-3 py-2">
						<span className="text-sm font-semibold">Media Library</span>
						<button
							type="button"
							onClick={handleClose}
							className="rounded p-0.5 hover:bg-muted"
						>
							<X className="size-4" />
						</button>
					</div>

					{/* Body */}
					<div className="flex min-h-0 flex-1">
						{/* Folder sidebar */}
						<div className="w-44 shrink-0 border-r bg-muted/20 overflow-hidden">
							<FolderTree
								selectedId={selectedFolder}
								onSelect={setSelectedFolder}
							/>
						</div>

						{/* Main panel */}
						<div className="flex min-w-0 flex-1 flex-col p-3">
							<Tabs
								value={activeTab}
								onValueChange={(v) => setActiveTab(v as any)}
								className="flex flex-1 flex-col min-h-0"
							>
								<TabsList className="h-8 w-fit shrink-0">
									<TabsTrigger value="browse" className="h-6 px-3 text-xs">
										<Image className="mr-1 size-3" />
										Browse
									</TabsTrigger>
									<TabsTrigger value="upload" className="h-6 px-3 text-xs">
										<Upload className="mr-1 size-3" />
										Upload
									</TabsTrigger>
									<TabsTrigger value="url" className="h-6 px-3 text-xs">
										<Link className="mr-1 size-3" />
										URL
									</TabsTrigger>
								</TabsList>

								<div className="mt-2 min-h-0 flex-1">
									<TabsContent value="browse" className="m-0 h-full">
										<BrowseTab
											folderId={selectedFolder}
											selected={selectedAssets}
											multiple={multiple}
											accept={accept}
											onToggle={handleToggleAsset}
										/>
									</TabsContent>
									<TabsContent value="upload" className="m-0 h-full">
										<UploadTab
											folderId={selectedFolder}
											accept={accept}
											onUploaded={handleUploaded}
										/>
									</TabsContent>
									<TabsContent value="url" className="m-0 h-full">
										<UrlTab
											folderId={selectedFolder}
											onRegistered={handleUrlRegistered}
										/>
									</TabsContent>
								</div>
							</Tabs>
						</div>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between border-t px-3 py-2">
						<span className="text-xs text-muted-foreground">
							{selectedAssets.length > 0
								? `${selectedAssets.length} selected`
								: "Click a file to select it"}
						</span>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleClose}
							>
								Cancel
							</Button>
							<Button
								type="button"
								size="sm"
								data-testid="media-select-button"
								onClick={handleConfirm}
								disabled={selectedAssets.length === 0}
							>
								{multiple
									? `Select ${selectedAssets.length > 0 ? `(${selectedAssets.length})` : ""}`
									: "Select"}
							</Button>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/**
 * ImageInputField — displays an image preview with change/remove actions, or a
 * "Browse Media" button that opens the full MediaPicker popover (Browse / Upload / URL tabs).
 *
 * Upload mode, folder selection, and multi-mode cloud support are all handled inside
 * the MediaPicker's UploadTab — this component is purely a thin wrapper.
 */
export function ImageInputField({
	value,
	onChange,
}: {
	value: string;
	onChange: (v: string) => void;
}) {
	const { Image: ImageComponent } = usePluginOverrides<
		MediaPluginOverrides,
		Partial<MediaPluginOverrides>
	>("media", {});

	if (value) {
		return (
			<div className="space-y-2">
				{ImageComponent ? (
					<ImageComponent
						src={value}
						alt="Featured image preview"
						className="h-auto w-full max-w-xs rounded-md border object-cover"
						width={400}
						height={300}
						data-testid="image-preview"
					/>
				) : (
					<img
						src={value}
						alt="Featured image preview"
						className="h-auto w-full max-w-xs rounded-md border object-cover"
						data-testid="image-preview"
					/>
				)}
				<div className="flex gap-2">
					<MediaPicker
						trigger={
							<Button
								variant="outline"
								size="sm"
								type="button"
								data-testid="open-media-picker"
							>
								Change Image
							</Button>
						}
						accept={["image/*"]}
						onSelect={(assets) => onChange(assets[0]?.url ?? "")}
					/>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						data-testid="remove-image-button"
						onClick={() => onChange("")}
					>
						Remove
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2 items-center">
			<MediaPicker
				trigger={
					<Button
						variant="outline"
						size="sm"
						type="button"
						data-testid="open-media-picker"
					>
						Browse Media
					</Button>
				}
				accept={["image/*"]}
				onSelect={(assets) => onChange(assets[0]?.url ?? "")}
			/>
		</div>
	);
}
