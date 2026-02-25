"use client";

import { useState, useCallback } from "react";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Label } from "@workspace/ui/components/label";
import { ArrowLeft, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import UIBuilder from "@workspace/ui/components/ui-builder";
import type {
	ComponentLayer,
	ComponentRegistry,
	Variable,
} from "@workspace/ui/components/ui-builder/types";

import { useLayerStore } from "@workspace/ui/lib/ui-builder/store/layer-store";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import {
	useSuspenseUIBuilderPage,
	useCreateUIBuilderPage,
	useUpdateUIBuilderPage,
} from "../../hooks/ui-builder-hooks";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { uiBuilderLocalization } from "../../localization";
import { defaultComponentRegistry } from "../../registry";
import type { SerializedUIBuilderPage } from "../../../types";

export interface PageBuilderPageProps {
	id?: string;
}

/**
 * Generate a concise AI-readable description of the available components
 * in the component registry, including their prop names.
 */
function buildRegistryDescription(registry: ComponentRegistry): string {
	const lines: string[] = [];
	for (const [name, entry] of Object.entries(registry) as [
		string,
		{ schema?: unknown },
	][]) {
		let propsLine = "";
		try {
			const shape = (entry.schema as any)?.shape as
				| Record<string, unknown>
				| undefined;
			if (shape) {
				const fields = Object.keys(shape).join(", ");
				propsLine = ` — props: ${fields}`;
			}
		} catch {
			// ignore schema introspection errors
		}
		lines.push(`- ${name}${propsLine}`);
	}
	return lines.join("\n");
}

/**
 * Build the full page description string for the AI context.
 * Stays within the 8,000-character pageContext limit.
 */
function buildPageDescription(
	id: string | undefined,
	slug: string,
	layers: ComponentLayer[],
	registry: ComponentRegistry,
): string {
	const header = id
		? `UI Builder — editing page (slug: "${slug}")`
		: "UI Builder — creating new page";

	const layersJson = JSON.stringify(layers, null, 2);

	const registryDesc = buildRegistryDescription(registry);

	const layerFormat = `Each layer: { id: string, type: string, name: string, props: Record<string,any>, children?: ComponentLayer[] | string }`;

	const full = [
		header,
		"",
		`## Current Layers (${layers.length})`,
		layersJson,
		"",
		`## Available Component Types`,
		registryDesc,
		"",
		`## ComponentLayer format`,
		layerFormat,
	].join("\n");

	// Trim to fit the 8,000-char server-side limit, cutting the layers JSON if needed
	if (full.length <= 8000) return full;

	// Re-build with truncated layers JSON
	const overhead =
		[
			header,
			"",
			`## Current Layers (${layers.length})`,
			"",
			"",
			`## Available Component Types`,
			registryDesc,
			"",
			`## ComponentLayer format`,
			layerFormat,
		].join("\n").length + 30; // 30-char buffer for "...(truncated)"

	const budget = Math.max(0, 8000 - overhead);
	const truncatedLayers =
		layersJson.length > budget
			? layersJson.slice(0, budget) + "\n...(truncated)"
			: layersJson;

	return [
		header,
		"",
		`## Current Layers (${layers.length})`,
		truncatedLayers,
		"",
		`## Available Component Types`,
		registryDesc,
		"",
		`## ComponentLayer format`,
		layerFormat,
	].join("\n");
}

/**
 * Slugify a string for URL-friendly slugs
 */
function slugify(str: string): string {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Entry point component that conditionally renders the appropriate
 * sub-component based on whether we're creating or editing a page.
 * This avoids conditional hook calls which violate React's Rules of Hooks.
 */
export function PageBuilderPage({ id }: PageBuilderPageProps) {
	if (id) {
		return <EditPageBuilderPage id={id} />;
	}
	return <CreatePageBuilderPage />;
}

/**
 * Component for editing an existing page.
 * Uses useSuspenseUIBuilderPage unconditionally since id is always defined.
 */
function EditPageBuilderPage({ id }: { id: string }) {
	const { page: existingPage } = useSuspenseUIBuilderPage(id);
	return <PageBuilderPageContent id={id} existingPage={existingPage} />;
}

/**
 * Component for creating a new page.
 * No data fetching needed.
 */
function CreatePageBuilderPage() {
	return <PageBuilderPageContent />;
}

interface PageBuilderPageContentProps {
	id?: string;
	existingPage?: SerializedUIBuilderPage | null;
}

/**
 * Parse JSON strings safely
 */
function parseLayers(layersJson?: string): ComponentLayer[] {
	if (!layersJson) return [];
	try {
		return JSON.parse(layersJson) as ComponentLayer[];
	} catch {
		return [];
	}
}

function parseVariables(variablesJson?: string): Variable[] {
	if (!variablesJson) return [];
	try {
		return JSON.parse(variablesJson) as Variable[];
	} catch {
		return [];
	}
}

function PageBuilderPageContent({
	id,
	existingPage,
}: PageBuilderPageContentProps) {
	const {
		navigate,
		Link,
		componentRegistry: customRegistry,
	} = usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const basePath = useBasePath();

	const createMutation = useCreateUIBuilderPage();
	const updateMutation = useUpdateUIBuilderPage();

	const loc = uiBuilderLocalization;
	const LinkComponent = Link || "a";
	const componentRegistry = customRegistry || defaultComponentRegistry;

	// Parse existing page data
	const existingLayers = parseLayers(existingPage?.parsedData?.layers);
	const existingVariables = parseVariables(existingPage?.parsedData?.variables);

	// Form state
	const [slug, setSlug] = useState(existingPage?.slug || "");
	const [status, setStatus] = useState<"published" | "draft" | "archived">(
		existingPage?.parsedData?.status || "draft",
	);
	const [layers, setLayers] = useState<ComponentLayer[]>(existingLayers);
	const [variables, setVariables] = useState<Variable[]>(existingVariables);

	// Auto-generate slug from first page name
	const [autoSlug, setAutoSlug] = useState(!id);

	// Register AI context so the chat can update the page layout
	useRegisterPageAIContext({
		routeName: id ? "ui-builder-edit-page" : "ui-builder-new-page",
		pageDescription: buildPageDescription(id, slug, layers, componentRegistry),
		suggestions: [
			"Add a hero section",
			"Add a 3-column feature grid",
			"Make the layout full-width",
			"Add a card with a title, description, and button",
			"Replace the layout with a centered single-column design",
		],
		clientTools: {
			updatePageLayers: async ({ layers: newLayers }) => {
				// Drive the UIBuilder's Zustand store directly so the editor
				// and layers panel update immediately. The store's onChange
				// callback will propagate back to the parent's `layers` state.
				const store = useLayerStore.getState();
				store.initialize(
					newLayers,
					store.selectedPageId || newLayers[0]?.id,
					undefined,
					store.variables,
				);
				return {
					success: true,
					message: `Applied ${newLayers.length} layer(s) to the page`,
				};
			},
		},
	});

	// Handle layers change from UIBuilder
	const handleLayersChange = useCallback(
		(newLayers: ComponentLayer[]) => {
			setLayers(newLayers);

			// Auto-generate slug from first page name if creating new page
			if (autoSlug && newLayers.length > 0 && newLayers[0]?.name) {
				setSlug(slugify(newLayers[0].name));
			}
		},
		[autoSlug],
	);

	// Handle variables change from UIBuilder
	const handleVariablesChange = useCallback((newVariables: Variable[]) => {
		setVariables(newVariables);
	}, []);

	const handleSave = async () => {
		if (!slug.trim()) {
			toast.error(loc.pageBuilder.validation.slugRequired);
			return;
		}

		if (!/^[a-z0-9-]+$/.test(slug)) {
			toast.error(loc.pageBuilder.validation.slugFormat);
			return;
		}

		if (layers.length === 0) {
			toast.error(loc.pageBuilder.validation.layersRequired);
			return;
		}

		try {
			if (id) {
				await updateMutation.mutateAsync({
					id,
					data: {
						layers,
						variables,
						status,
					},
				});
				toast.success(loc.pageBuilder.saved);
			} else {
				const newPage = await createMutation.mutateAsync({
					slug,
					layers,
					variables,
					status,
				});
				toast.success(loc.pageBuilder.saved);
				navigate?.(`${basePath}/ui-builder/${newPage.id}/edit`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("slug already exists")) {
				toast.error("A page with this slug already exists");
			} else {
				toast.error(loc.pageBuilder.saveError);
			}
		}
	};

	const isSaving = createMutation.isPending || updateMutation.isPending;

	// Shared form fields - used in both mobile popover and desktop inline
	const pageSettingsFields = (isMobile: boolean) => (
		<div
			className={isMobile ? "flex flex-col gap-4" : "flex items-center gap-4"}
		>
			<div className={isMobile ? "flex flex-col gap-2" : ""}>
				{isMobile && (
					<Label htmlFor="page-slug" className="text-sm font-medium">
						{loc.pageBuilder.slugLabel}
					</Label>
				)}
				<Input
					id="page-slug"
					value={slug}
					onChange={(e) => {
						setSlug(e.target.value);
						setAutoSlug(false);
					}}
					placeholder={loc.pageBuilder.slugPlaceholder}
					className={
						isMobile ? "h-9 font-mono text-sm" : "h-8 w-48 font-mono text-sm"
					}
					disabled={!!id}
				/>
			</div>

			<div className={isMobile ? "flex flex-col gap-2" : ""}>
				{isMobile && (
					<Label htmlFor="page-status" className="text-sm font-medium">
						{loc.pageBuilder.statusLabel}
					</Label>
				)}
				<Select
					value={status}
					onValueChange={(v) => setStatus(v as typeof status)}
				>
					<SelectTrigger className={isMobile ? "h-9 w-full" : "h-8 w-28"}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="draft">
							{loc.pageBuilder.statusOptions.draft}
						</SelectItem>
						<SelectItem value="published">
							{loc.pageBuilder.statusOptions.published}
						</SelectItem>
						<SelectItem value="archived">
							{loc.pageBuilder.statusOptions.archived}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);

	// NavBar left children - back button, mobile popover, desktop inline fields
	const navLeftChildren = (
		<div className="flex items-center gap-2 md:gap-4">
			<Button variant="ghost" size="icon" asChild className="shrink-0">
				<LinkComponent href={`${basePath}/ui-builder`}>
					<ArrowLeft className="h-4 w-4" />
				</LinkComponent>
			</Button>

			{/* Mobile: Popover with settings */}
			<div className="md:hidden">
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm" className="gap-2">
							<Settings2 className="h-4 w-4" />
							<span className="max-w-20 truncate font-mono text-xs">
								{slug || loc.pageBuilder.slugPlaceholder}
							</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent className="z-[9999] w-72" align="start">
						<div className="grid gap-4">
							<div className="space-y-2">
								<h4 className="font-medium leading-none">Page Settings</h4>
								<p className="text-sm text-muted-foreground">
									Configure page slug and status
								</p>
							</div>
							{pageSettingsFields(true)}
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{/* Desktop: Inline fields */}
			<div className="hidden md:flex md:items-center md:gap-4">
				{pageSettingsFields(false)}
			</div>
		</div>
	);

	// NavBar right children - save button (icon only on mobile, with text on desktop)
	const navRightChildren = (
		<Button
			onClick={handleSave}
			disabled={isSaving}
			size="icon"
			className="md:w-auto md:px-4"
		>
			<Save className="h-4 w-4 md:mr-2" />
			<span className="hidden md:inline">
				{isSaving
					? loc.pageBuilder.saving
					: id
						? loc.pageBuilder.save
						: loc.pageBuilder.save}
			</span>
		</Button>
	);

	return (
		<div className="flex h-full flex-col" data-testid="page-builder-page">
			<UIBuilder
				initialLayers={existingLayers.length > 0 ? existingLayers : undefined}
				onChange={handleLayersChange}
				initialVariables={
					existingVariables.length > 0 ? existingVariables : undefined
				}
				onVariablesChange={handleVariablesChange}
				componentRegistry={componentRegistry}
				persistLayerStore={false}
				allowVariableEditing={true}
				allowPagesCreation={false}
				allowPagesDeletion={false}
				showExport={false}
				navLeftChildren={navLeftChildren}
				navRightChildren={navRightChildren}
			/>
		</div>
	);
}
