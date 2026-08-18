"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { z } from "zod";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import type {
	FieldConfig,
	AutoFormInputComponentProps,
} from "@workspace/ui/components/auto-form/types";
import { buildFieldConfigFromJsonSchema as buildFieldConfigBase } from "@workspace/ui/components/auto-form/helpers";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import type { SerializedContentType, RelationConfig } from "../../../types";
import { slugify } from "../../../utils";
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
	/**
	 * Server-side field validation errors (`StackError.errors`), applied to
	 * the matching form fields for inline display.
	 */
	fieldErrors?: Record<string, string | string[]>;
	/** Non-field submit error to display above the form */
	errorMessage?: string;
	/** External submit-in-flight state (e.g. from a resource `useForm`) */
	isSubmitting?: boolean;
}

/**
 * Applies server-side field validation errors onto react-hook-form field
 * state, and clears previously applied server errors that are no longer
 * present. The form instance arrives asynchronously (captured from
 * SteppedAutoForm's `onValuesChange`) and is `null` for multi-step forms.
 */
function useServerFieldErrors<T extends FieldValues>(
	form: UseFormReturn<T> | null,
	fieldErrors: Record<string, string | string[]>,
) {
	const appliedFieldsRef = useRef<string[]>([]);

	useEffect(() => {
		if (!form) return;

		// Clear stale server errors from fields that are no longer failing
		for (const field of appliedFieldsRef.current) {
			if (field in fieldErrors) continue;
			const { error } = form.getFieldState(field as FieldPath<T>);
			if (error?.type === "server") {
				form.clearErrors(field as FieldPath<T>);
			}
		}
		appliedFieldsRef.current = Object.keys(fieldErrors);

		for (const [field, message] of Object.entries(fieldErrors)) {
			form.setError(field as FieldPath<T>, {
				type: "server",
				message: Array.isArray(message) ? message.join(", ") : message,
			});
		}
	}, [fieldErrors, form]);
}

/**
 * Build field configuration for AutoForm with CMS-specific file upload handling.
 *
 * Uses the shared buildFieldConfigFromJsonSchema from auto-form/helpers as a base,
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
	imagePicker?: React.ComponentType<{ onSelect: (url: string) => void }>,
	imageInputField?: React.ComponentType<{
		value: string;
		onChange: (value: string) => void;
		isRequired?: boolean;
	}>,
): FieldConfig<Record<string, unknown>> {
	// Get base config from shared utility (handles fieldType from JSON Schema,
	// including per-item configs for arrays of objects).
	const baseConfig = buildFieldConfigBase(jsonSchema, fieldComponents);

	const properties = jsonSchema.properties as
		| Record<string, JsonSchemaProperty>
		| undefined;

	if (!properties) return baseConfig;

	// Recursively walk the JSON Schema properties and inject CMS-specific custom
	// components (file upload, relation picker) for any field with a matching
	// fieldType, regardless of nesting depth. Targets:
	//   - top-level fields
	//   - properties of nested object fields
	//   - properties of array items (e.g. `components: z.array(z.object({...}))`)
	//
	// `targetConfig` is the FieldConfigObject slot to mutate for the property at
	// `key`. The recursion mirrors how AutoFormObject + AutoFormArray look up
	// per-property configs: nested object/array per-item configs live as keys
	// alongside their parent's meta on the same FieldConfigObject.
	const injectCustomFieldTypes = (
		props: Record<string, JsonSchemaProperty>,
		targetConfig: Record<string, unknown>,
	) => {
		for (const [key, prop] of Object.entries(props)) {
			// Ensure a slot exists so we can mutate it whether or not the base
			// helper produced an entry for this key.
			const existing =
				(targetConfig[key] as Record<string, unknown> | undefined) ?? {};

			let updated = existing;

			// Handle "file" fieldType when there's NO custom component for "file"
			if (prop.fieldType === "file" && !fieldComponents?.["file"]) {
				if (!uploadImage && !imageInputField) {
					updated = {
						...updated,
						fieldType: () => (
							<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
								File upload requires an <code>uploadImage</code> or{" "}
								<code>imageInputField</code> function in CMS overrides.
							</div>
						),
					};
				} else {
					updated = {
						...updated,
						fieldType: (componentProps: AutoFormInputComponentProps) => (
							<CMSFileUpload
								{...componentProps}
								uploadImage={uploadImage ?? (() => Promise.resolve(""))}
								imageInputField={imageInputField}
								imagePicker={imagePicker}
							/>
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
				updated = {
					...updated,
					fieldType: (componentProps: AutoFormInputComponentProps) => (
						<RelationField {...componentProps} relation={relationConfig} />
					),
				};
			}

			// Recurse into nested objects — their per-property configs live as
			// keys on the same parent FieldConfigObject.
			if (prop.properties) {
				injectCustomFieldTypes(
					prop.properties as Record<string, JsonSchemaProperty>,
					updated,
				);
			}

			// Recurse into array items — same convention as nested objects.
			const items = prop.items as JsonSchemaProperty | undefined;
			if (items?.properties) {
				injectCustomFieldTypes(
					items.properties as Record<string, JsonSchemaProperty>,
					updated,
				);
			}

			if (Object.keys(updated).length > 0) {
				targetConfig[key] = updated;
			}
		}
	};

	injectCustomFieldTypes(
		properties,
		baseConfig as unknown as Record<string, unknown>,
	);

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
	fieldErrors,
	errorMessage,
	isSubmitting: isSubmittingProp,
}: ContentFormProps) {
	const t = useTranslate();
	const {
		localization,
		uploadImage,
		imagePicker,
		imageInputField,
		fieldComponents,
	} = usePluginOverrides<CMSPluginOverrides>("cms");

	const [slug, setSlug] = useState(initialSlug);
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEditing);
	const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
	const [formData, setFormData] =
		useState<Record<string, unknown>>(initialData);
	const [slugError, setSlugError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const isSubmitting = isSubmittingProp || isSubmittingLocal;

	// Single-step forms pass their react-hook-form instance through
	// onValuesChange; multi-step forms pass undefined (no single instance).
	const [formInstance, setFormInstance] = useState<UseFormReturn<
		Record<string, unknown>
	> | null>(null);

	const serverFieldErrors = useMemo(() => fieldErrors ?? {}, [fieldErrors]);
	useServerFieldErrors(formInstance, serverFieldErrors);
	const hasFieldErrors = Object.keys(serverFieldErrors).length > 0;

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
			buildFieldConfigFromJsonSchema(
				jsonSchema,
				uploadImage,
				fieldComponents,
				imagePicker,
				imageInputField,
			),
		[jsonSchema, uploadImage, fieldComponents, imagePicker, imageInputField],
	);

	// Find the field to use for slug auto-generation
	const slugSourceField = useMemo(
		() => findSlugSourceField(jsonSchema),
		[jsonSchema],
	);

	// Handle form value changes for slug auto-generation
	const handleValuesChange = (
		values: Record<string, unknown>,
		form?: UseFormReturn<Record<string, unknown>>,
	) => {
		if (form) {
			setFormInstance((current) => (current === form ? current : form));
		}
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
			setSlugError(
				localization?.CMS_EDITOR_SLUG_REQUIRED ??
					t("cms.editor.slugRequired", "Slug is required"),
			);
			return;
		}

		setIsSubmittingLocal(true);
		try {
			await onSubmit({ slug, data });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: (localization?.CMS_TOAST_ERROR ??
						t("cms.toasts.error", "An error occurred. Please try again."));
			setSubmitError(message);
		} finally {
			setIsSubmittingLocal(false);
		}
	};

	// Non-field error from the parent (resource form), or a local submit
	// failure. Field errors display inline instead — unless the form
	// instance is unavailable (multi-step), where they land in the banner.
	const bannerMessage =
		errorMessage ??
		submitError ??
		(hasFieldErrors && !formInstance
			? Object.entries(serverFieldErrors)
					.map(
						([field, message]) =>
							`${field}: ${Array.isArray(message) ? message.join(", ") : message}`,
					)
					.join(" · ")
			: undefined);

	return (
		<div className="space-y-6">
			{/* Slug field */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<Label htmlFor="slug">
						{localization?.CMS_LABEL_SLUG ?? t("cms.common.slugLabel", "Slug")}
					</Label>
					{!isEditing && (
						<Badge variant="outline" className="text-xs">
							{slugManuallyEdited
								? (localization?.CMS_EDITOR_SLUG_MANUAL ??
									t("cms.editor.slugManual", "Manually set"))
								: (localization?.CMS_EDITOR_SLUG_AUTO ??
									t("cms.editor.slugAuto", "Auto-generated from first field"))}
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
							? (
									localization?.CMS_EDITOR_SLUG_PLACEHOLDER_AUTO ??
									t(
										"cms.editor.slugPlaceholderAuto",
										"Auto-generated from {field}",
									)
								).replace("{field}", slugSourceField)
							: (localization?.CMS_EDITOR_SLUG_PLACEHOLDER ??
								t("cms.editor.slugPlaceholder", "Enter slug..."))
					}
				/>
				{slugError && <p className="text-sm text-destructive">{slugError}</p>}
				<p className="text-sm text-muted-foreground">
					{localization?.CMS_LABEL_SLUG_DESCRIPTION ??
						t(
							"cms.common.slugDescription",
							"URL-friendly identifier for this item",
						)}
				</p>
			</div>

			{/* Submit error message */}
			{bannerMessage && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
					<p className="text-sm text-destructive">{bannerMessage}</p>
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
						? (localization?.CMS_STATUS_SAVING ??
							t("cms.common.saving", "Saving..."))
						: (localization?.CMS_BUTTON_SAVE ?? t("cms.common.save", "Save"))
				}
			>
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
					>
						{localization?.CMS_BUTTON_CANCEL ??
							t("cms.common.cancel", "Cancel")}
					</button>
				)}
			</SteppedAutoForm>
		</div>
	);
}
