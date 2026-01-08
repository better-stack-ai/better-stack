/**
 * UI Builder plugin localization strings
 */
export const uiBuilderLocalization = {
	pageList: {
		title: "UI Builder Pages",
		description:
			"Create and manage visual pages with the drag-and-drop builder",
		createButton: "Create Page",
		emptyState: {
			title: "No pages yet",
			description: "Create your first page with the visual builder",
		},
		columns: {
			name: "Name",
			slug: "Slug",
			status: "Status",
			updatedAt: "Updated",
			actions: "Actions",
		},
		actions: {
			edit: "Edit",
			delete: "Delete",
			preview: "Preview",
		},
		deleteDialog: {
			title: "Delete Page",
			description:
				"Are you sure you want to delete this page? This action cannot be undone.",
			cancel: "Cancel",
			confirm: "Delete",
		},
	},
	pageBuilder: {
		newPage: "New Page",
		editPage: "Edit Page",
		backToList: "Back to Pages",
		save: "Save",
		saving: "Saving...",
		saved: "Saved",
		saveError: "Failed to save",
		slugLabel: "Page Slug",
		slugPlaceholder: "my-page-slug",
		slugDescription: "URL-friendly identifier for this page",
		statusLabel: "Status",
		statusOptions: {
			draft: "Draft",
			published: "Published",
			archived: "Archived",
		},
		validation: {
			slugRequired: "Slug is required",
			slugFormat:
				"Slug must contain only lowercase letters, numbers, and hyphens",
			layersRequired: "Page must have at least one component",
		},
	},
	pageRenderer: {
		loading: "Loading page...",
		notFound: "Page not found",
		error: "Failed to load page",
	},
} as const;

export type UIBuilderLocalization = typeof uiBuilderLocalization;
