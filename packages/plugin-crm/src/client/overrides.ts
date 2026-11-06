/** CRM labels supplied by the host application. */
export interface CrmPluginOverrides {
	/** Navigation labels; remaining labels use the built-in English copy. */
	localization?: { contacts?: string; companies?: string; pipelines?: string };
}
