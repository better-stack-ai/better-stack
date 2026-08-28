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
import {
	PermissionAccess,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import { mediaPermissions } from "../../../permissions";
import type { MediaPluginOverrides } from "../../overrides";
import {
	MediaFinalizePermissionCheck,
	MediaUploadPermissionCheck,
} from "../upload-permission-check";

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

function AssetSelectionAccess({
	assets,
	children,
}: {
	assets: readonly SerializedAsset[];
	children: ReactNode;
}) {
	const [asset, ...rest] = assets;
	if (!asset) return children;
	return (
		<PermissionAccess
			permission={mediaPermissions.asset.read({
				assetId: asset.id,
				...(asset.folderId ? { folderId: asset.folderId } : {}),
				mimeType: asset.mimeType,
			})}
		>
			<AssetSelectionAccess assets={rest}>{children}</AssetSelectionAccess>
		</PermissionAccess>
	);
}

/**
 * MediaPicker — a Popover-based media browser.
 *
 * Reads API and router config from `StackProvider`.
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
	const t = useTranslate();
	const { uploadMode = "direct" } =
		usePluginOverrides<MediaPluginOverrides>("media");
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
		// URL registration grants upload-finalize permission, not read/select
		// permission. Send the result through the same asset.read-gated confirmation
		// path as browsed and uploaded assets.
		handleUploaded(asset);
		setActiveTab("browse");
	};

	return (
		<PermissionAccess permission={mediaPermissions.library.read()}>
			<MediaUploadPermissionCheck
				mode={uploadMode}
				folderId={selectedFolder ?? undefined}
			>
				{({ can: canUpload, isPending, error }) => {
					if (error) throw error;
					const uploadAllowed = canUpload && !isPending;
					return (
						<MediaFinalizePermissionCheck
							folderId={selectedFolder ?? undefined}
						>
							{({ can: canFinalize, isPending: finalizePending, error }) => {
								if (error) throw error;
								const finalizeAllowed = canFinalize && !finalizePending;
								const visibleTab =
									(activeTab === "upload" && !uploadAllowed) ||
									(activeTab === "url" && !finalizeAllowed)
										? "browse"
										: activeTab;
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
											className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:w-[820px]"
											align="start"
											sideOffset={8}
											collisionPadding={8}
											style={{
												maxWidth: "min(820px, calc(100vw - 1rem))",
												height: "min(640px, calc(100dvh - 2rem))",
											}}
										>
											<div className="flex h-full flex-col overflow-hidden rounded-md">
												{/* Header */}
												<div className="flex items-center justify-between border-b px-3 py-2">
													<span className="text-sm font-semibold">
														{t("media.picker.title", "Media Library")}
													</span>
													<button
														type="button"
														aria-label={t("media.actions.close", "Close")}
														onClick={handleClose}
														className="rounded p-0.5 hover:bg-muted"
													>
														<X className="size-4" />
													</button>
												</div>

												{/* Body */}
												<div className="flex min-h-0 flex-1 flex-col md:flex-row">
													{/* Folder sidebar */}
													<div className="max-h-40 w-full shrink-0 overflow-hidden border-b bg-muted/20 md:max-h-none md:w-44 md:border-b-0 md:border-r">
														<FolderTree
															selectedId={selectedFolder}
															onSelect={setSelectedFolder}
														/>
													</div>

													{/* Main panel */}
													<div className="flex min-w-0 flex-1 flex-col p-3 overflow-y-hidden">
														<Tabs
															value={visibleTab}
															onValueChange={(v) => setActiveTab(v as any)}
															className="flex flex-1 flex-col min-h-0"
														>
															<TabsList
																className={`grid h-auto w-full shrink-0 ${uploadAllowed && finalizeAllowed ? "grid-cols-3" : uploadAllowed || finalizeAllowed ? "grid-cols-2" : "grid-cols-1"} md:flex md:w-fit`}
															>
																<TabsTrigger
																	value="browse"
																	className="h-8 px-2 text-xs md:h-6 md:px-3"
																>
																	<Image className="mr-1 size-3" />
																	{t("media.tabs.browse", "Browse")}
																</TabsTrigger>
																{uploadAllowed ? (
																	<TabsTrigger
																		value="upload"
																		className="h-8 px-2 text-xs md:h-6 md:px-3"
																	>
																		<Upload className="mr-1 size-3" />
																		{t("media.tabs.upload", "Upload")}
																	</TabsTrigger>
																) : null}
																{finalizeAllowed ? (
																	<TabsTrigger
																		value="url"
																		className="h-8 px-2 text-xs md:h-6 md:px-3"
																	>
																		<Link className="mr-1 size-3" />
																		{t("media.tabs.url", "URL")}
																	</TabsTrigger>
																) : null}
															</TabsList>

															<div className="mt-2 min-h-0 flex-1">
																<TabsContent
																	value="browse"
																	className="m-0 h-full min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
																>
																	<BrowseTab
																		folderId={selectedFolder}
																		selected={selectedAssets}
																		accept={accept}
																		onToggle={handleToggleAsset}
																	/>
																</TabsContent>
																{uploadAllowed ? (
																	<TabsContent
																		value="upload"
																		className="m-0 h-full min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
																	>
																		<UploadTab
																			folderId={selectedFolder}
																			accept={accept}
																			onUploaded={handleUploaded}
																		/>
																	</TabsContent>
																) : null}
																{finalizeAllowed ? (
																	<TabsContent
																		value="url"
																		className="m-0 h-full min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
																	>
																		<UrlTab
																			folderId={selectedFolder}
																			onRegistered={handleUrlRegistered}
																		/>
																	</TabsContent>
																) : null}
															</div>
														</Tabs>
													</div>
												</div>

												{/* Footer */}
												<div className="flex flex-col gap-2 border-t px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
													<span className="text-xs text-muted-foreground">
														{selectedAssets.length > 0
															? t(
																	"media.picker.selected",
																	"{{count}} selected",
																	{
																		count: selectedAssets.length,
																	},
																)
															: t(
																	"media.picker.selectHint",
																	"Click a file to select it",
																)}
													</span>
													<div className="flex w-full gap-2 sm:w-auto">
														<Button
															type="button"
															variant="ghost"
															size="sm"
															onClick={handleClose}
															className="flex-1 sm:flex-none"
														>
															{t("media.actions.cancel", "Cancel")}
														</Button>
														<AssetSelectionAccess assets={selectedAssets}>
															<Button
																type="button"
																size="sm"
																data-testid="media-select-button"
																onClick={handleConfirm}
																disabled={selectedAssets.length === 0}
																className="flex-1 sm:flex-none"
															>
																{multiple
																	? t(
																			"media.actions.selectMany",
																			"Select ({{count}})",
																			{
																				count: selectedAssets.length,
																			},
																		)
																	: t("media.actions.select", "Select")}
															</Button>
														</AssetSelectionAccess>
													</div>
												</div>
											</div>
										</PopoverContent>
									</Popover>
								);
							}}
						</MediaFinalizePermissionCheck>
					);
				}}
			</MediaUploadPermissionCheck>
		</PermissionAccess>
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
	const t = useTranslate();
	const { router } = useStack();
	const ImageComponent = router?.Image;

	if (value) {
		return (
			<div className="space-y-2">
				{ImageComponent ? (
					<ImageComponent
						src={value}
						alt={t("media.image.previewAlt", "Featured image preview")}
						className="h-auto w-full max-w-xs rounded-md border object-cover"
						width={400}
						height={300}
						data-testid="image-preview"
					/>
				) : (
					<img
						src={value}
						alt={t("media.image.previewAlt", "Featured image preview")}
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
								{t("media.image.change", "Change Image")}
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
						{t("media.image.remove", "Remove")}
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
						{t("media.image.browse", "Browse Media")}
					</Button>
				}
				accept={["image/*"]}
				onSelect={(assets) => onChange(assets[0]?.url ?? "")}
			/>
		</div>
	);
}
