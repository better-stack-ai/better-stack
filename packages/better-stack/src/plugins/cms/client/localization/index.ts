import { CMS_COMMON } from "./cms-common";
import { CMS_TOASTS } from "./cms-toasts";
import { CMS_DASHBOARD } from "./cms-dashboard";
import { CMS_LIST } from "./cms-list";
import { CMS_EDITOR } from "./cms-editor";

export const CMS_LOCALIZATION = {
	...CMS_COMMON,
	...CMS_TOASTS,
	...CMS_DASHBOARD,
	...CMS_LIST,
	...CMS_EDITOR,
};

export type CMSLocalization = typeof CMS_LOCALIZATION;
