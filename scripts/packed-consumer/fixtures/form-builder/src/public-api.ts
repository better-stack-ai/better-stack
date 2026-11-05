import {
	formBuilderBackendPlugin,
	getFormById,
	type FormBuilderBackendConfig,
} from "@btst/plugin-form-builder/api";
import {
	formBuilderClientPlugin,
	type FormBuilderPluginOverrides,
} from "@btst/plugin-form-builder/client";
import { FormRenderer } from "@btst/plugin-form-builder/client/components";
import {
	useFormBySlug,
	useSubmitForm,
} from "@btst/plugin-form-builder/client/hooks";
import { createFormBuilderQueryKeys } from "@btst/plugin-form-builder/query-keys";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import type { Form, FormSubmission } from "@btst/plugin-form-builder/types";

export type PackedFormBuilderApi = {
	backend: typeof formBuilderBackendPlugin;
	config: FormBuilderBackendConfig;
	getter: typeof getFormById;
	client: typeof formBuilderClientPlugin;
	overrides: FormBuilderPluginOverrides;
	renderer: typeof FormRenderer;
	hook: typeof useFormBySlug;
	submit: typeof useSubmitForm;
	queries: typeof createFormBuilderQueryKeys;
	permissions: typeof formBuilderPermissions;
	form: Form;
	submission: FormSubmission;
};
