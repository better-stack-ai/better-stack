"use client";

import { useState, useEffect, useCallback } from "react";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { FormBuilder } from "@workspace/ui/components/form-builder";
import type { JSONSchema } from "@workspace/ui/components/form-builder/types";

import {
	useSuspenseFormById,
	useCreateForm,
	useUpdateForm,
} from "../../hooks/form-builder-hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_LOCALIZATION } from "../../localization";
import { slugify } from "../../../utils";

export interface FormBuilderPageProps {
	id?: string;
}

export function FormBuilderPage({ id }: FormBuilderPageProps) {
	const { navigate, Link, localization } = usePluginOverrides<
		FormBuilderPluginOverrides,
		Partial<FormBuilderPluginOverrides>
	>("form-builder", {
		localization: FORM_BUILDER_LOCALIZATION,
	});
	const basePath = useBasePath();

	// Fetch existing form if editing
	const { form: existingForm } = id ? useSuspenseFormById(id) : { form: null };

	const createMutation = useCreateForm();
	const updateMutation = useUpdateForm();

	const loc = localization || FORM_BUILDER_LOCALIZATION;
	const LinkComponent = Link || "a";

	// Form state
	const [name, setName] = useState(existingForm?.name || "");
	const [slug, setSlug] = useState(existingForm?.slug || "");
	const [status, setStatus] = useState<"active" | "inactive" | "archived">(
		(existingForm?.status as "active" | "inactive" | "archived") || "active",
	);
	const [schema, setSchema] = useState<JSONSchema | undefined>(() => {
		if (existingForm?.schema) {
			try {
				return JSON.parse(existingForm.schema) as JSONSchema;
			} catch {
				return undefined;
			}
		}
		return undefined;
	});

	// Auto-generate slug from name
	const [autoSlug, setAutoSlug] = useState(!id);

	useEffect(() => {
		if (autoSlug && name) {
			setSlug(slugify(name));
		}
	}, [name, autoSlug]);

	const handleSchemaChange = useCallback((newSchema: JSONSchema) => {
		setSchema(newSchema);
	}, []);

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		if (!slug.trim()) {
			toast.error("Slug is required");
			return;
		}
		if (!schema) {
			toast.error("Please add at least one field to the form");
			return;
		}

		try {
			const schemaStr = JSON.stringify(schema);

			if (id) {
				await updateMutation.mutateAsync({
					id,
					data: {
						name,
						schema: schemaStr,
						status,
					},
				});
				toast.success(loc.FORM_BUILDER_TOAST_UPDATE_SUCCESS);
			} else {
				const newForm = await createMutation.mutateAsync({
					name,
					slug,
					schema: schemaStr,
					status,
				});
				toast.success(loc.FORM_BUILDER_TOAST_CREATE_SUCCESS);
				navigate?.(`${basePath}/forms/${newForm.id}/edit`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			if (message.includes("slug already exists")) {
				toast.error(loc.FORM_BUILDER_TOAST_DUPLICATE_SLUG);
			} else {
				toast.error(loc.FORM_BUILDER_TOAST_ERROR);
			}
		}
	};

	const isSaving = createMutation.isPending || updateMutation.isPending;

	return (
		<div className="flex h-full flex-col" data-testid="form-builder-page">
			{/* Header */}
			<div className="flex items-center gap-4 border-b p-4">
				<Button variant="ghost" size="icon" asChild>
					<LinkComponent href={`${basePath}/forms`}>
						<ArrowLeft className="h-4 w-4" />
					</LinkComponent>
				</Button>

				<div className="flex flex-col gap-1">
					<Label htmlFor="form-name" className="text-xs text-muted-foreground">
						{loc.FORM_BUILDER_LABEL_NAME}
					</Label>
					<Input
						id="form-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={loc.FORM_BUILDER_EDITOR_NAME_PLACEHOLDER}
						className="h-8 w-48"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label htmlFor="form-slug" className="text-xs text-muted-foreground">
						{loc.FORM_BUILDER_LABEL_SLUG}
					</Label>
					<Input
						id="form-slug"
						value={slug}
						onChange={(e) => {
							setSlug(e.target.value);
							setAutoSlug(false);
						}}
						placeholder={loc.FORM_BUILDER_EDITOR_SLUG_PLACEHOLDER}
						className="h-8 w-48 font-mono text-sm"
						disabled={!!id}
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label
						htmlFor="form-status"
						className="text-xs text-muted-foreground"
					>
						{loc.FORM_BUILDER_LABEL_STATUS}
					</Label>
					<Select
						value={status}
						onValueChange={(v) => setStatus(v as typeof status)}
					>
						<SelectTrigger className="h-8 w-28">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="active">
								{loc.FORM_BUILDER_STATUS_ACTIVE}
							</SelectItem>
							<SelectItem value="inactive">
								{loc.FORM_BUILDER_STATUS_INACTIVE}
							</SelectItem>
							<SelectItem value="archived">
								{loc.FORM_BUILDER_STATUS_ARCHIVED}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="ml-auto">
					<Button onClick={handleSave} disabled={isSaving}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving
							? loc.FORM_BUILDER_STATUS_SAVING
							: id
								? loc.FORM_BUILDER_BUTTON_SAVE
								: loc.FORM_BUILDER_BUTTON_CREATE}
					</Button>
				</div>
			</div>

			{/* Form Builder */}
			<FormBuilder
				value={schema}
				onChange={handleSchemaChange}
				className="flex-1"
			/>
		</div>
	);
}
