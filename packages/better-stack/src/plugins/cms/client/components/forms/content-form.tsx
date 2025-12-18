"use client";

import { useState, useMemo, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import AutoForm, {
	AutoFormSubmit,
} from "@workspace/ui/components/ui/auto-form";
import type {
	FieldConfig,
	AutoFormInputComponentProps,
} from "@workspace/ui/components/ui/auto-form/types";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import type { SerializedContentType } from "../../../types";
import { slugify } from "../../../utils";
import { CMS_LOCALIZATION } from "../../localization";
import { CMSFileUpload } from "./file-upload";

/**
 * JSON Schema property type definition
 */
interface JsonSchemaProperty {
	type?: string | string[];
	format?: string;
	enum?: (string | number | boolean)[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	default?: unknown;
	description?: string;
}

interface JsonSchema {
	type?: string;
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
}

/**
 * Convert JSON Schema to Zod schema with proper coercion for AutoForm
 *
 * Uses Zod v4's native z.fromJSONSchema() as a base and applies coercion
 * where needed. AutoForm requires z.coerce.number() and z.coerce.date()
 * for proper form handling because HTML inputs return strings.
 *
 * Note: We build the schema manually to ensure proper coercion support,
 * as z.fromJSONSchema() doesn't add coercion automatically.
 */
function jsonSchemaToZodWithCoercion(
	jsonSchema: JsonSchema,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
	const shape: Record<string, z.ZodTypeAny> = {};
	const properties = jsonSchema.properties || {};
	const required = jsonSchema.required || [];

	for (const [key, prop] of Object.entries(properties)) {
		let fieldSchema: z.ZodTypeAny;

		// Determine the type (handle arrays like ["string", "null"] for nullable)
		const typeValue = Array.isArray(prop.type) ? prop.type[0] : prop.type;

		// Handle enum first - works for string enums
		if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
			// Filter to only string values for z.enum
			const stringValues = prop.enum.filter(
				(v): v is string => typeof v === "string",
			);
			if (stringValues.length > 0) {
				fieldSchema = z.enum(stringValues as [string, ...string[]]);
			} else {
				// Fallback for non-string enums
				fieldSchema = z.string();
			}
		} else {
			switch (typeValue) {
				case "number":
				case "integer": {
					// Use z.coerce.number() for proper form handling (HTML inputs return strings)
					let numSchema = z.coerce.number();
					if (prop.minimum !== undefined) {
						numSchema = numSchema.min(prop.minimum);
					}
					if (prop.maximum !== undefined) {
						numSchema = numSchema.max(prop.maximum);
					}
					fieldSchema = numSchema;
					break;
				}
				case "boolean": {
					fieldSchema = z.boolean();
					if (prop.default !== undefined) {
						fieldSchema = (fieldSchema as z.ZodBoolean).default(
							prop.default as boolean,
						);
					}
					break;
				}
				case "string": {
					// Check for date format
					if (prop.format === "date" || prop.format === "date-time") {
						fieldSchema = z.coerce.date();
					} else {
						let strSchema = z.string();
						if (prop.minLength !== undefined) {
							strSchema = strSchema.min(prop.minLength);
						}
						if (prop.maxLength !== undefined) {
							strSchema = strSchema.max(prop.maxLength);
						}
						fieldSchema = strSchema;
					}
					break;
				}
				default: {
					// Fallback to string for unknown types
					fieldSchema = z.string();
				}
			}
		}

		// Apply default if present and not already applied (skip for booleans which handle it above)
		// Use typeValue to correctly handle nullable types where prop.type is an array like ["boolean", "null"]
		if (prop.default !== undefined && typeValue !== "boolean") {
			fieldSchema = fieldSchema.default(prop.default);
		}

		// Make optional if not in required array
		if (!required.includes(key)) {
			fieldSchema = fieldSchema.optional();
		}

		shape[key] = fieldSchema;
	}

	return z.object(shape);
}

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
 * Built-in AutoForm field types
 */
const BUILTIN_FIELD_TYPES = [
	"checkbox",
	"date",
	"select",
	"radio",
	"switch",
	"textarea",
	"number",
	"file",
	"fallback",
] as const;

/**
 * Extract field configuration from JSON Schema properties
 * Maps description and placeholder to AutoForm's fieldConfig format
 *
 * @param jsonSchema - The JSON Schema from the content type
 * @param storedFieldConfig - The stored field config from the content type
 * @param uploadImage - The uploadImage function from overrides (for default file component)
 * @param fieldComponents - Custom field components from overrides
 */
function buildFieldConfigFromJsonSchema(
	jsonSchema: Record<string, unknown>,
	storedFieldConfig?: Record<string, { fieldType?: string }>,
	uploadImage?: (file: File) => Promise<string>,
	fieldComponents?: Record<
		string,
		React.ComponentType<AutoFormInputComponentProps>
	>,
): FieldConfig<Record<string, unknown>> {
	const fieldConfig: FieldConfig<Record<string, unknown>> = {};
	const properties = jsonSchema.properties as Record<
		string,
		{ description?: string; placeholder?: string }
	>;

	if (!properties) return fieldConfig;

	for (const [key, value] of Object.entries(properties)) {
		const config: Record<string, unknown> = {};

		if (value.description) {
			config.description = value.description;
		}

		if (value.placeholder) {
			config.inputProps = {
				placeholder: value.placeholder,
			};
		}

		// Apply stored fieldConfig overrides (e.g., fieldType: "textarea", "file", or custom types)
		if (storedFieldConfig?.[key]) {
			const storedConfig = storedFieldConfig[key];
			const fieldType = storedConfig.fieldType;

			if (fieldType) {
				// 1. Check if there's a custom component in fieldComponents
				if (fieldComponents?.[fieldType]) {
					const CustomComponent = fieldComponents[fieldType];
					config.fieldType = (props: AutoFormInputComponentProps) => (
						<CustomComponent {...props} />
					);
				}
				// 2. Special handling for built-in "file" type - use CMSFileUpload with uploadImage
				else if (fieldType === "file") {
					if (!uploadImage) {
						// Show a clear error message if uploadImage is not provided
						config.fieldType = () => (
							<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
								File upload requires an <code>uploadImage</code> function in CMS
								overrides.
							</div>
						);
					} else {
						config.fieldType = (props: AutoFormInputComponentProps) => (
							<CMSFileUpload {...props} uploadImage={uploadImage} />
						);
					}
				}
				// 3. For other built-in types, pass through to auto-form
				else if (
					BUILTIN_FIELD_TYPES.includes(
						fieldType as (typeof BUILTIN_FIELD_TYPES)[number],
					)
				) {
					config.fieldType = fieldType;
				}
				// 4. Unknown custom type without a component - log warning and skip
				else {
					console.warn(
						`CMS: Unknown fieldType "${fieldType}" for field "${key}". ` +
							`Provide a component via fieldComponents override or use a built-in type.`,
					);
				}
			}
		}

		if (Object.keys(config).length > 0) {
			fieldConfig[key] = config;
		}
	}

	return fieldConfig;
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

	// Sync formData with initialData when it changes (e.g., when editing an existing item)
	// This is necessary because useState only uses the initial value once on mount
	useEffect(() => {
		// Only sync when we're in editing mode and initialData has content
		// This ensures we properly load existing item data into the form
		if (isEditing && Object.keys(initialData).length > 0) {
			setFormData(initialData);
		}
	}, [initialData, isEditing]);

	// Also sync slug when initialSlug changes
	useEffect(() => {
		if (isEditing && initialSlug) {
			setSlug(initialSlug);
		}
	}, [initialSlug, isEditing]);

	// Parse JSON Schema
	const jsonSchema = useMemo(() => {
		try {
			return JSON.parse(contentType.jsonSchema) as Record<string, unknown>;
		} catch {
			return {};
		}
	}, [contentType.jsonSchema]);

	// Parse stored field config
	const storedFieldConfig = useMemo(() => {
		if (!contentType.fieldConfig) return undefined;
		try {
			return JSON.parse(contentType.fieldConfig) as Record<
				string,
				{ fieldType?: string }
			>;
		} catch {
			return undefined;
		}
	}, [contentType.fieldConfig]);

	// Convert to Zod schema with coercion for proper AutoForm handling
	const zodSchema = useMemo(() => {
		try {
			return jsonSchemaToZodWithCoercion(jsonSchema as JsonSchema);
		} catch {
			return z.object({});
		}
	}, [jsonSchema]);

	// Build field config for AutoForm
	const fieldConfig = useMemo(
		() =>
			buildFieldConfigFromJsonSchema(
				jsonSchema,
				storedFieldConfig,
				uploadImage,
				fieldComponents,
			),
		[jsonSchema, storedFieldConfig, uploadImage, fieldComponents],
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
		if (!slug.trim()) {
			toast.error("Slug is required");
			return;
		}

		setIsSubmitting(true);
		try {
			await onSubmit({ slug, data });
			toast.success(
				isEditing
					? localization.CMS_TOAST_UPDATE_SUCCESS
					: localization.CMS_TOAST_CREATE_SUCCESS,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : localization.CMS_TOAST_ERROR;
			toast.error(message);
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
				<p className="text-sm text-muted-foreground">
					{localization.CMS_LABEL_SLUG_DESCRIPTION}
				</p>
			</div>

			{/* Dynamic form from Zod schema */}
			<AutoForm
				formSchema={zodSchema as z.ZodObject<any, any>}
				values={formData as any}
				onValuesChange={handleValuesChange as any}
				onSubmit={handleSubmit as any}
				fieldConfig={fieldConfig as any}
			>
				<div className="flex items-center gap-2 pt-4">
					<AutoFormSubmit disabled={isSubmitting}>
						{isSubmitting
							? localization.CMS_STATUS_SAVING
							: localization.CMS_BUTTON_SAVE}
					</AutoFormSubmit>
					{onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
						>
							{localization.CMS_BUTTON_CANCEL}
						</button>
					)}
				</div>
			</AutoForm>
		</div>
	);
}
