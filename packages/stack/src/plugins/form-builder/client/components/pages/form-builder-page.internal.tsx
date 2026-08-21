"use client";

import { useState, useEffect, useCallback } from "react";
import {
	useNotify,
	usePluginOverrides,
	useBasePath,
	useStack,
	useTranslate,
} from "@btst/stack/context";
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
import { FormBuilder } from "@workspace/ui/components/form-builder";
import type { JSONSchema } from "@workspace/ui/components/form-builder/types";

import { useSuspenseFormById, useFormBuilderForm } from "../../hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { slugify } from "../../../utils";
import type { SerializedForm } from "../../../types";

export interface FormBuilderPageProps {
	id?: string;
}

/**
 * Entry point component that conditionally renders the appropriate
 * sub-component based on whether we're creating or editing a form.
 * This avoids conditional hook calls which violate React's Rules of Hooks.
 */
export function FormBuilderPage({ id }: FormBuilderPageProps) {
	if (id) {
		return <EditFormBuilderPage id={id} />;
	}
	return <CreateFormBuilderPage />;
}

/**
 * Component for editing an existing form.
 * Uses useSuspenseFormById unconditionally since id is always defined.
 */
function EditFormBuilderPage({ id }: { id: string }) {
	const { form: existingForm } = useSuspenseFormById(id);
	return <FormBuilderPageContent id={id} existingForm={existingForm} />;
}

/**
 * Component for creating a new form.
 * No data fetching needed.
 */
function CreateFormBuilderPage() {
	return <FormBuilderPageContent />;
}

interface FormBuilderPageContentProps {
	id?: string;
	existingForm?: SerializedForm | null;
}

interface FormBuilderFormValues {
	name: string;
	slug: string;
	status: "active" | "inactive" | "archived";
	schema: string;
}

function FormBuilderPageContent({
	id,
	existingForm,
}: FormBuilderPageContentProps) {
	const t = useTranslate();
	const notify = useNotify();
	const { localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const { router } = useStack();
	const basePath = useBasePath();

	const LinkComponent = router?.Link ?? "a";

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

	// Core resource form: submits the right mutation, awaits invalidation,
	// notifies success/error via useNotify(), redirects after create, and
	// exposes server validation issues as fieldErrors for inline display.
	const resourceForm = useFormBuilderForm<FormBuilderFormValues>({
		action: id ? "edit" : "create",
		record: id ? (existingForm ?? null) : null,
		successMessage: (_result, action) =>
			action === "create"
				? (localization?.FORM_BUILDER_TOAST_CREATE_SUCCESS ??
					t("formBuilder.toasts.createSuccess", "Form created successfully"))
				: (localization?.FORM_BUILDER_TOAST_UPDATE_SUCCESS ??
					t("formBuilder.toasts.updateSuccess", "Form updated successfully")),
		errorMessage: (error) =>
			error.statusCode === 409
				? (localization?.FORM_BUILDER_TOAST_DUPLICATE_SLUG ??
					t(
						"formBuilder.toasts.duplicateSlug",
						"A form with this slug already exists",
					))
				: (localization?.FORM_BUILDER_TOAST_ERROR ??
					t(
						"formBuilder.toasts.error",
						"An error occurred. Please try again.",
					)),
		toCreateVars: (values) => values,
		toUpdateVars: (values) => ({
			id: id ?? "",
			data: {
				name: values.name,
				schema: values.schema,
				status: values.status,
			},
		}),
		redirect: (result, action) =>
			action === "create" && result
				? `${basePath}/forms/${result.id}/edit`
				: false,
	});

	const handleSave = async () => {
		if (!name.trim()) {
			notify.error(
				localization?.FORM_BUILDER_TOAST_NAME_REQUIRED ??
					t("formBuilder.toasts.nameRequired", "Name is required"),
			);
			return;
		}
		if (!slug.trim()) {
			notify.error(
				localization?.FORM_BUILDER_TOAST_SLUG_REQUIRED ??
					t("formBuilder.toasts.slugRequired", "Slug is required"),
			);
			return;
		}
		if (!schema) {
			notify.error(
				localization?.FORM_BUILDER_TOAST_SCHEMA_REQUIRED ??
					t(
						"formBuilder.toasts.schemaRequired",
						"Please add at least one field to the form",
					),
			);
			return;
		}

		// resourceForm.submit never throws: success notifies + redirects via
		// the config above; errors land on resourceForm.fieldErrors or notify.
		await resourceForm.submit({
			name,
			slug,
			status,
			schema: JSON.stringify(schema),
		});
	};

	const isSaving = resourceForm.isSubmitting;
	const fieldError = (field: string): string | undefined => {
		const error = resourceForm.fieldErrors[field];
		if (!error) return undefined;
		return Array.isArray(error) ? error[0] : error;
	};

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
						{localization?.FORM_BUILDER_LABEL_NAME ??
							t("formBuilder.common.labelName", "Name")}
					</Label>
					<Input
						id="form-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={
							localization?.FORM_BUILDER_EDITOR_NAME_PLACEHOLDER ??
							t("formBuilder.editor.namePlaceholder", "Enter form name")
						}
						className="h-8 w-48"
					/>
					{fieldError("name") && (
						<p className="text-xs text-destructive">{fieldError("name")}</p>
					)}
				</div>

				<div className="flex flex-col gap-1">
					<Label htmlFor="form-slug" className="text-xs text-muted-foreground">
						{localization?.FORM_BUILDER_LABEL_SLUG ??
							t("formBuilder.common.labelSlug", "Slug")}
					</Label>
					<Input
						id="form-slug"
						value={slug}
						onChange={(e) => {
							setSlug(e.target.value);
							setAutoSlug(false);
						}}
						placeholder={
							localization?.FORM_BUILDER_EDITOR_SLUG_PLACEHOLDER ??
							t("formBuilder.editor.slugPlaceholder", "enter-form-slug")
						}
						className="h-8 w-48 font-mono text-sm"
						disabled={!!id}
					/>
					{fieldError("slug") && (
						<p className="text-xs text-destructive">{fieldError("slug")}</p>
					)}
				</div>

				<div className="flex flex-col gap-1">
					<Label
						htmlFor="form-status"
						className="text-xs text-muted-foreground"
					>
						{localization?.FORM_BUILDER_LABEL_STATUS ??
							t("formBuilder.common.labelStatus", "Status")}
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
								{localization?.FORM_BUILDER_STATUS_ACTIVE ??
									t("formBuilder.common.statusActive", "Active")}
							</SelectItem>
							<SelectItem value="inactive">
								{localization?.FORM_BUILDER_STATUS_INACTIVE ??
									t("formBuilder.common.statusInactive", "Inactive")}
							</SelectItem>
							<SelectItem value="archived">
								{localization?.FORM_BUILDER_STATUS_ARCHIVED ??
									t("formBuilder.common.statusArchived", "Archived")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="ml-auto">
					<Button onClick={handleSave} disabled={isSaving}>
						<Save className="mr-2 h-4 w-4" />
						{isSaving
							? (localization?.FORM_BUILDER_STATUS_SAVING ??
								t("formBuilder.common.statusSaving", "Saving..."))
							: id
								? (localization?.FORM_BUILDER_BUTTON_SAVE ??
									t("formBuilder.common.buttonSave", "Save"))
								: (localization?.FORM_BUILDER_BUTTON_CREATE ??
									t("formBuilder.common.buttonCreate", "Create"))}
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
