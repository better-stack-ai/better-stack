"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { z } from "zod";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import type {
	FieldConfig,
	AutoFormInputComponentProps,
} from "@workspace/ui/components/auto-form/types";
import { buildFieldConfigFromJsonSchema as buildFieldConfigBase } from "@workspace/ui/components/auto-form/utils";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import type { SerializedContentType, RelationConfig } from "../../../types";
import { slugify } from "../../../utils";
import { CMS_LOCALIZATION } from "../../localization";
import { CMSFileUpload } from "./file-upload";
import { RelationField } from "./relation-field";

interface ContentFormProps {
	contentType: SerializedContentType;
	initialData?: Record<string, unknown>;
	initialSlug?: string;
	isEditing?: boolean;
	onSubmit: (data: {
		slug: string;
		data: Record<string, unknown>;
	}) => Promise<void>;
	onCancel?: () => void;
}

/**
 * Build field configuration for AutoForm with CMS-specific file upload handling.
 *
 * Uses the shared buildFieldConfigFromJsonSchema from auto-form/utils as a base,
 * then adds special handling for "file" fieldType to inject CMSFileUpload component
 * ONLY if no custom component is provided via fieldComponents.
 *
 * @param jsonSchema - The JSON Schema from the content type (with fieldType embedded in properties)
 * @param uploadImage - The uploadImage function from overrides (for file fields)
 * @param fieldComponents - Custom field components from overrides
 */
interface JsonSchemaProperty {
	fieldType?: string;
	relation?: RelationConfig;
	[key: string]: unknown;
}

function buildFieldConfigFromJsonSchema(
	jsonSchema: Record<string, unknown>,
	uploadImage?: (file: File) => Promise<string>,
	fieldComponents?: Record<
		string,
		React.ComponentType<AutoFormInputComponentProps>
	>,
): FieldConfig<Record<string, unknown>> {
	// Get base config from shared utility (handles fieldType from JSON Schema)
	const baseConfig = buildFieldConfigBase(jsonSchema, fieldComponents);

	// Apply CMS-specific handling for special fieldTypes ONLY if no custom component exists
	// Custom fieldComponents take priority - don't override if user provided one
	const properties = jsonSchema.properties as Record<
		string,
		JsonSchemaProperty
	>;

	if (!properties) return baseConfig;

	for (const [key, prop] of Object.entries(properties)) {
		// Handle "file" fieldType when there's NO custom component for "file"
		if (prop.fieldType === "file" && !fieldComponents?.["file"]) {
			// Use CMSFileUpload as the default file component
			if (!uploadImage) {
				// Show a clear error message if uploadImage is not provided
				baseConfig[key] = {
					...baseConfig[key],
					fieldType: () => (
						<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
							File upload requires an <code>uploadImage</code> function in CMS
							overrides.
						</div>
					),
				};
			} else {
				baseConfig[key] = {
					...baseConfig[key],
					fieldType: (props: AutoFormInputComponentProps) => (
						<CMSFileUpload {...props} uploadImage={uploadImage} />
					),
				};
			}
		}

		// Handle "relation" fieldType when there's NO custom component for "relation"
		if (
			prop.fieldType === "relation" &&
			prop.relation &&
			!fieldComponents?.["relation"]
		) {
			const relationConfig = prop.relation;
			baseConfig[key] = {
				...baseConfig[key],
				fieldType: (props: AutoFormInputComponentProps) => (
					<RelationField {...props} relation={relationConfig} />
				),
			};
		}
	}

	return baseConfig;
}

/**
 * Determine the first string field in the schema for slug auto-generation
 */
function findSlugSourceField(
	jsonSchema: Record<string, unknown>,
): string | null {
	const properties = jsonSchema.properties as Record<string, { type?: string }>;
	if (!properties) return null;

	// Look for common name fields first
	const priorityFields = ["name", "title", "heading", "label"];
	for (const field of priorityFields) {
		if (properties[field]?.type === "string") {
			return field;
		}
	}

	// Fall back to first string field
	for (const [key, value] of Object.entries(properties)) {
		if (value.type === "string") {
			return key;
		}
	}

	return null;
}

export function ContentForm({
	contentType,
	initialData = {},
	initialSlug = "",
	isEditing = false,
	onSubmit,
	onCancel,
}: ContentFormProps) {
	const {
		localization: customLocalization,
		uploadImage,
		fieldComponents,
	} = usePluginOverrides<CMSPluginOverrides>("cms");
	const localization = { ...CMS_LOCALIZATION, ...customLocalization };

	const [slug, setSlug] = useState(initialSlug);
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEditing);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [formData, setFormData] =
		useState<Record<string, unknown>>(initialData);
	const [slugError, setSlugError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// Track if we've already synced prefill data to avoid overwriting user input
	const hasSyncedPrefillRef = useRef(false);

	// Sync formData with initialData when it changes
	// This handles both:
	// 1. Editing mode: always sync when item data is loaded (isEditing=true)
	// 2. Create mode: only sync prefill data ONCE to avoid overwriting user input
	// useState only uses the initial value on mount, so we need this effect for updates
	useEffect(() => {
		const hasData = Object.keys(initialData).length > 0;
		// In edit mode, always sync (user is loading existing data)
		// In create mode, only sync prefill data once
		const shouldSync = hasData && (isEditing || !hasSyncedPrefillRef.current);

		if (shouldSync) {
			setFormData(initialData);
			if (!isEditing) {
				hasSyncedPrefillRef.current = true;
			}
		}
	}, [initialData, isEditing]);

	// Also sync slug when initialSlug changes
	useEffect(() => {
		if (isEditing && initialSlug) {
			setSlug(initialSlug);
		}
	}, [initialSlug, isEditing]);

	// Parse JSON Schema (now includes fieldType embedded in properties)
	const jsonSchema = useMemo(() => {
		try {
			return JSON.parse(contentType.jsonSchema) as Record<string, unknown>;
		} catch {
			return {};
		}
	}, [contentType.jsonSchema]);

	// Convert JSON Schema to Zod schema using formSchemaToZod utility
	// This properly handles date fields (format: "date-time") and min/max date constraints
	const zodSchema = useMemo(() => {
		try {
			return formSchemaToZod(jsonSchema);
		} catch {
			return z.object({});
		}
	}, [jsonSchema]);

	// Build field config for AutoForm (fieldType is now embedded in jsonSchema)
	const fieldConfig = useMemo(
		() =>
			buildFieldConfigFromJsonSchema(jsonSchema, uploadImage, fieldComponents),
		[jsonSchema, uploadImage, fieldComponents],
	);

	// Find the field to use for slug auto-generation
	const slugSourceField = useMemo(
		() => findSlugSourceField(jsonSchema),
		[jsonSchema],
	);

	// Handle form value changes for slug auto-generation
	const handleValuesChange = (values: Record<string, unknown>) => {
		setFormData(values);

		// Auto-generate slug from source field if not manually edited
		if (!isEditing && !slugManuallyEdited && slugSourceField) {
			const sourceValue = values[slugSourceField];
			if (typeof sourceValue === "string" && sourceValue.trim()) {
				setSlug(slugify(sourceValue));
			}
		}
	};

	// Handle form submission
	const handleSubmit = async (data: Record<string, unknown>) => {
		setSlugError(null);
		setSubmitError(null);

		if (!slug.trim()) {
			setSlugError("Slug is required");
			return;
		}

		setIsSubmitting(true);
		try {
			await onSubmit({ slug, data });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : localization.CMS_TOAST_ERROR;
			setSubmitError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6">
			{/* Slug field */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<Label htmlFor="slug">{localization.CMS_LABEL_SLUG}</Label>
					{!isEditing && (
						<Badge variant="outline" className="text-xs">
							{slugManuallyEdited
								? localization.CMS_EDITOR_SLUG_MANUAL
								: localization.CMS_EDITOR_SLUG_AUTO}
						</Badge>
					)}
				</div>
				<Input
					id="slug"
					value={slug}
					onChange={(e) => {
						setSlug(e.target.value);
						setSlugError(null);
						if (!isEditing) {
							setSlugManuallyEdited(true);
						}
					}}
					disabled={isEditing}
					placeholder={
						slugSourceField
							? `Auto-generated from ${slugSourceField}`
							: "Enter slug..."
					}
				/>
				{slugError && <p className="text-sm text-destructive">{slugError}</p>}
				<p className="text-sm text-muted-foreground">
					{localization.CMS_LABEL_SLUG_DESCRIPTION}
				</p>
			</div>

			{/* Submit error message */}
			{submitError && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
					<p className="text-sm text-destructive">{submitError}</p>
				</div>
			)}

			{/* Dynamic form from Zod schema */}
			{/* Uses SteppedAutoForm which automatically handles both single-step and multi-step content types */}
			<SteppedAutoForm
				formSchema={zodSchema as z.ZodObject<any, any>}
				values={formData as any}
				onValuesChange={handleValuesChange as any}
				onSubmit={handleSubmit as any}
				fieldConfig={fieldConfig as any}
				isSubmitting={isSubmitting}
				submitButtonText={
					isSubmitting
						? localization.CMS_STATUS_SAVING
						: localization.CMS_BUTTON_SAVE
				}
			>
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
					>
						{localization.CMS_BUTTON_CANCEL}
					</button>
				)}
			</SteppedAutoForm>
		</div>
	);
}
