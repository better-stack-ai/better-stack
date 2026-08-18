"use client";

import { useState, useMemo, type ComponentType } from "react";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/helpers";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { AlertCircle, CheckCircle } from "lucide-react";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

import { useFormBySlug, useSubmitForm } from "../../hooks/form-builder-hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import type { SerializedFormSubmission } from "../../../types";

export interface FormRendererProps {
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
	const { localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

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
	const { localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

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
	const { fieldComponents: overrideFieldComponents, localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

	const { form, isLoading, error } = useFormBySlug(slug);
	const submitMutation = useSubmitForm(slug);

	const [submitted, setSubmitted] = useState(false);
	const [finalSuccessMessage, setFinalSuccessMessage] = useState<string | null>(
		null,
	);

	// Merge field components from props and overrides
	const mergedFieldComponents = useMemo(
		() => ({
			...overrideFieldComponents,
			...propFieldComponents,
		}),
		[overrideFieldComponents, propFieldComponents],
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

			return { zodSchema: zod, fieldConfig: config };
		} catch {
			return { zodSchema: null, fieldConfig: {} };
		}
	}, [form?.schema, mergedFieldComponents]);

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
			<div className={className}>
				<LoadingComponent />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className={className}>
				<ErrorComponent error={error} />
			</div>
		);
	}

	// Form not found
	if (!form) {
		return (
			<div className={className}>
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
			<div className={className}>
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
			<div className={className}>
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
			<div className={className}>
				<DefaultSuccessComponent message={finalSuccessMessage} />
			</div>
		);
	}

	// Render form using SteppedAutoForm
	// It automatically handles both single-step and multi-step forms
	return (
		<div className={className} data-testid="form-renderer">
			<SteppedAutoForm
				formSchema={zodSchema}
				fieldConfig={fieldConfig}
				onSubmit={(values) => handleSubmit(values as Record<string, unknown>)}
				isSubmitting={submitMutation.isPending}
				submitButtonText={
					submitButtonText ||
					(localization?.FORM_BUILDER_BUTTON_SUBMIT ??
						t("formBuilder.common.buttonSubmit", "Submit"))
				}
			/>
		</div>
	);
}
