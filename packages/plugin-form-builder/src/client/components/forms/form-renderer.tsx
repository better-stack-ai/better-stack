"use client";

import { useState, useMemo, type ComponentType } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/helpers";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { AlertCircle, CheckCircle } from "lucide-react";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

import { useFormBySlug, useSubmitForm } from "../../hooks/form-builder-hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import type { SerializedFormSubmission } from "../../../types";
import { formBuilderPermissions } from "../../../permissions";
import { FORM_BUILDER_PLUGIN_ID } from "../../constants";
import { cn } from "../../../utils";
import { MediaFileField } from "./media-file-field";

export interface FormRendererProps {
	/** Upload a standalone file and return its URL string. */
	onUpload?: (file: File) => Promise<string>;
	/** Form slug to render */
	slug: string;
	/** Callback when form submission succeeds */
	onSuccess?: (
		submission: SerializedFormSubmission & {
			form: { successMessage?: string; redirectUrl?: string };
		},
	) => void;
	/** Callback when form submission fails */
	onError?: (error: Error) => void;
	/** Custom field components (same as FormBuilder) */
	fieldComponents?: Record<string, ComponentType<AutoFormInputComponentProps>>;
	/** Override success message */
	successMessage?: React.ReactNode;
	/** Override submit button text */
	submitButtonText?: string;
	/** Custom loading component */
	LoadingComponent?: ComponentType;
	/** Custom error component */
	ErrorComponent?: ComponentType<{ error: Error }>;
	/** Class name for the form container */
	className?: string;
}

function DefaultLoadingComponent() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-32" />
		</div>
	);
}

function DefaultErrorComponent({ error }: { error: Error }) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<FormBuilderPluginOverrides>(
		FORM_BUILDER_PLUGIN_ID,
	);

	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="rounded-full bg-destructive/10 p-3 mb-4">
				<AlertCircle className="h-6 w-6 text-destructive" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-2">
				{localization?.FORM_BUILDER_RENDERER_LOAD_FAILED ??
					t("formBuilder.renderer.loadFailed", "Failed to load form")}
			</h3>
			<p className="text-sm text-muted-foreground max-w-sm">
				{error.message ||
					(localization?.FORM_BUILDER_RENDERER_UNEXPECTED_ERROR ??
						t(
							"formBuilder.renderer.unexpectedError",
							"An unexpected error occurred",
						))}
			</p>
		</div>
	);
}

function DefaultSuccessComponent({ message }: { message: React.ReactNode }) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<FormBuilderPluginOverrides>(
		FORM_BUILDER_PLUGIN_ID,
	);

	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="rounded-full bg-green-100 dark:bg-green-900 p-3 mb-4">
				<CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-2">
				{localization?.FORM_BUILDER_RENDERER_SUBMITTED_TITLE ??
					t("formBuilder.renderer.submittedTitle", "Form Submitted")}
			</h3>
			<p className="text-sm text-muted-foreground max-w-sm">{message}</p>
		</div>
	);
}

/**
 * FormRenderer component for rendering forms on the frontend.
 *
 * Uses SteppedAutoForm which automatically handles both single-step and multi-step forms.
 *
 * @example
 * ```tsx
 * <FormRenderer
 *   slug="contact-form"
 *   onSuccess={() => {
 *     toast.success("Thank you!");
 *   }}
 *   onError={(error) => {
 *     toast.error("Something went wrong");
 *   }}
 * />
 * ```
 */
export function FormRenderer({
	slug,
	onUpload: propOnUpload,
	onSuccess,
	onError,
	fieldComponents: propFieldComponents,
	successMessage: propSuccessMessage,
	submitButtonText,
	LoadingComponent = DefaultLoadingComponent,
	ErrorComponent = DefaultErrorComponent,
	className,
}: FormRendererProps) {
	const t = useTranslate();
	const {
		fieldComponents: overrideFieldComponents,
		onUpload: overrideOnUpload,
		uploadFile,
		imagePicker,
		imageInputField,
		localization,
		classNames,
	} = usePluginOverrides<FormBuilderPluginOverrides>(FORM_BUILDER_PLUGIN_ID);

	const formClassName = cn(className, classNames?.form);
	const { form, isLoading, error } = useFormBySlug(slug);
	const submitMutation = useSubmitForm(slug);

	const [submitted, setSubmitted] = useState(false);
	const [finalSuccessMessage, setFinalSuccessMessage] = useState<string | null>(
		null,
	);

	// Merge field components from props and overrides
	const mergedFieldComponents = useMemo(
		() => ({
			...(!propOnUpload && (imagePicker || imageInputField)
				? { file: MediaFileField }
				: {}),
			...overrideFieldComponents,
			...propFieldComponents,
		}),
		[
			imagePicker,
			imageInputField,
			overrideFieldComponents,
			propFieldComponents,
			propOnUpload,
		],
	);

	// Parse JSON Schema and create Zod schema
	const { zodSchema, fieldConfig } = useMemo(() => {
		if (!form?.schema) {
			return { zodSchema: null, fieldConfig: {} };
		}

		try {
			const parsedSchema = JSON.parse(form.schema);
			const zod = formSchemaToZod(parsedSchema);
			const config = buildFieldConfigFromJsonSchema(
				parsedSchema,
				mergedFieldComponents,
			);

			const applyUpload = (fields: Record<string, any>) => {
				for (const field of Object.values(fields)) {
					if (field.fieldType === "file")
						field.onUpload = propOnUpload ?? uploadFile ?? overrideOnUpload;
					for (const value of Object.values(field))
						if (value && typeof value === "object" && !Array.isArray(value))
							applyUpload({ child: value });
				}
			};
			applyUpload(config);
			return { zodSchema: zod, fieldConfig: config };
		} catch {
			return { zodSchema: null, fieldConfig: {} };
		}
	}, [
		form?.schema,
		mergedFieldComponents,
		propOnUpload,
		uploadFile,
		overrideOnUpload,
	]);

	const handleSubmit = async (data: Record<string, unknown>) => {
		try {
			const result = await submitMutation.mutateAsync({ data });

			// Set success message
			const message =
				propSuccessMessage ||
				result.form.successMessage ||
				(localization?.FORM_BUILDER_RENDERER_THANK_YOU ??
					t("formBuilder.renderer.thankYou", "Thank you for your submission!"));
			setFinalSuccessMessage(message as string);
			setSubmitted(true);

			// Call onSuccess callback before any redirect
			onSuccess?.(result);

			// Handle redirect
			if (result.form.redirectUrl) {
				window.location.href = result.form.redirectUrl;
				return;
			}
		} catch (err) {
			onError?.(err as Error);
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className={formClassName}>
				<LoadingComponent />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className={formClassName}>
				<ErrorComponent error={error} />
			</div>
		);
	}

	// Form not found
	if (!form) {
		return (
			<div className={formClassName}>
				<ErrorComponent
					error={
						new Error(
							localization?.FORM_BUILDER_RENDERER_NOT_FOUND ??
								t("formBuilder.renderer.notFound", "Form not found"),
						)
					}
				/>
			</div>
		);
	}

	// Form not active
	if (form.status !== "active") {
		return (
			<div className={formClassName}>
				<ErrorComponent
					error={
						new Error(
							localization?.FORM_BUILDER_RENDERER_INACTIVE ??
								t(
									"formBuilder.renderer.inactive",
									"This form is not currently accepting submissions",
								),
						)
					}
				/>
			</div>
		);
	}

	// Schema parsing failed
	if (!zodSchema) {
		return (
			<div className={formClassName}>
				<ErrorComponent
					error={
						new Error(
							localization?.FORM_BUILDER_RENDERER_SCHEMA_ERROR ??
								t(
									"formBuilder.renderer.schemaError",
									"Failed to parse form schema",
								),
						)
					}
				/>
			</div>
		);
	}

	// Success state
	if (submitted && finalSuccessMessage) {
		return (
			<div className={formClassName}>
				<DefaultSuccessComponent message={finalSuccessMessage} />
			</div>
		);
	}

	// Render form using SteppedAutoForm
	// It automatically handles both single-step and multi-step forms
	return (
		<PermissionAccess
			permission={formBuilderPermissions.form.render({
				slug: form.slug,
				exists: true,
				formId: form.id,
				...(form.createdBy ? { ownerId: form.createdBy } : {}),
				status: form.status,
			})}
		>
			<PermissionAccess
				permission={formBuilderPermissions.submission.create({
					slug: form.slug,
					exists: true,
					formId: form.id,
					...(form.createdBy ? { ownerId: form.createdBy } : {}),
					status: form.status,
				})}
			>
				<div className={formClassName} data-testid="form-renderer">
					<SteppedAutoForm
						formSchema={zodSchema}
						fieldConfig={fieldConfig}
						onSubmit={(values) =>
							handleSubmit(values as Record<string, unknown>)
						}
						isSubmitting={submitMutation.isPending}
						submitButtonText={
							submitButtonText ||
							(localization?.FORM_BUILDER_BUTTON_SUBMIT ??
								t("formBuilder.common.buttonSubmit", "Submit"))
						}
					/>
				</div>
			</PermissionAccess>
		</PermissionAccess>
	);
}
