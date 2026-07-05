/**
 * Client-only resource hooks (`"use client"` modules).
 *
 * Kept separate from `@btst/stack/plugins/client` so plugin factory entries
 * (`client/plugin.tsx`) stay server-import-safe during SSG.
 */

export {
	createResource,
	type CreateResourceConfig,
	type Resource,
	type ResourceDetailData,
	type ResourceHandle,
	type ResourceInfiniteQueryHooks,
	type ResourceMutationHooks,
	type ResourcePlainQueryHooks,
	type ResourceQueryHooks,
	type ResourceQueryOptions,
} from "../resource/hooks";
export type { ResourceOverrides } from "../resource/internal";
export {
	createUseForm,
	type ResourceFormConfig,
	type ResourceFormResult,
} from "../resource/use-form";
export {
	createUseSelect,
	type ResourceSelectConfig,
	type ResourceSelectOption,
	type ResourceSelectResult,
} from "../resource/use-select";
export { useDebounce } from "../resource/use-debounce";
