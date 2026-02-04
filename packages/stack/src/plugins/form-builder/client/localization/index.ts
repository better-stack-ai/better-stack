import { FORM_BUILDER_COMMON } from "./form-builder-common";
import { FORM_BUILDER_TOASTS } from "./form-builder-toasts";
import { FORM_BUILDER_LIST } from "./form-builder-list";
import { FORM_BUILDER_EDITOR } from "./form-builder-editor";
import { FORM_BUILDER_SUBMISSIONS } from "./form-builder-submissions";

export const FORM_BUILDER_LOCALIZATION = {
	...FORM_BUILDER_COMMON,
	...FORM_BUILDER_TOASTS,
	...FORM_BUILDER_LIST,
	...FORM_BUILDER_EDITOR,
	...FORM_BUILDER_SUBMISSIONS,
};

export type FormBuilderLocalization = typeof FORM_BUILDER_LOCALIZATION;
