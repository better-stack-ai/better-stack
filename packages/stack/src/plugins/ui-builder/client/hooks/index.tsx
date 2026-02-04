// UI Builder client hooks
export {
	// List hooks
	useUIBuilderPages,
	useSuspenseUIBuilderPages,
	// Single page hooks
	useUIBuilderPage,
	useSuspenseUIBuilderPage,
	useUIBuilderPageBySlug,
	useSuspenseUIBuilderPageBySlug,
	// Mutation hooks
	useCreateUIBuilderPage,
	useUpdateUIBuilderPage,
	useDeleteUIBuilderPage,
	// Types
	type UseUIBuilderPagesOptions,
	type UseUIBuilderPagesResult,
	type CreateUIBuilderPageInput,
	type UpdateUIBuilderPageInput,
} from "./ui-builder-hooks";
