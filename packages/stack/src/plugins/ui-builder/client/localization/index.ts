export interface UIBuilderLocalization {
	pageList: {
		title: string;
		description: string;
		createButton: string;
		emptyState: { title: string; description: string };
		columns: {
			name: string;
			slug: string;
			status: string;
			updatedAt: string;
			actions: string;
		};
		actions: { label: string; edit: string; delete: string };
		deleteDialog: {
			title: string;
			description: string;
			cancel: string;
			confirm: string;
			deleting: string;
		};
		pagination: {
			showing: string;
			loadMore: string;
			loading: string;
		};
		deleteSuccess: string;
		deleteError: string;
	};
	pageBuilder: {
		newPage: string;
		editPage: string;
		backToList: string;
		save: string;
		saving: string;
		saved: string;
		saveError: string;
		duplicateSlug: string;
		slugLabel: string;
		slugPlaceholder: string;
		slugDescription: string;
		statusLabel: string;
		settingsTitle: string;
		settingsDescription: string;
		statusOptions: {
			draft: string;
			published: string;
			archived: string;
		};
		validation: {
			slugRequired: string;
			slugFormat: string;
			layersRequired: string;
		};
	};
	pageRenderer: { loading: string; notFound: string; error: string };
	common: {
		errorTitle: string;
		unexpectedError: string;
		tryAgain: string;
	};
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type UIBuilderLocalizationOverrides = DeepPartial<UIBuilderLocalization>;

export const uiBuilderLocalization: UIBuilderLocalization = {
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
		actions: { label: "Actions", edit: "Edit", delete: "Delete" },
		deleteDialog: {
			title: "Delete Page",
			description:
				"Are you sure you want to delete this page? This action cannot be undone.",
			cancel: "Cancel",
			confirm: "Delete",
			deleting: "Deleting...",
		},
		pagination: {
			showing: "Showing {count} of {total}",
			loadMore: "Load More",
			loading: "Loading...",
		},
		deleteSuccess: "Page deleted successfully",
		deleteError: "Failed to delete page",
	},
	pageBuilder: {
		newPage: "New Page",
		editPage: "Edit Page",
		backToList: "Back to Pages",
		save: "Save",
		saving: "Saving...",
		saved: "Saved",
		saveError: "Failed to save",
		duplicateSlug: "A page with this slug already exists",
		slugLabel: "Page Slug",
		slugPlaceholder: "my-page-slug",
		slugDescription: "URL-friendly identifier for this page",
		statusLabel: "Status",
		settingsTitle: "Page Settings",
		settingsDescription: "Configure page slug and status",
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
	common: {
		errorTitle: "Something went wrong",
		unexpectedError: "An unexpected error occurred",
		tryAgain: "Try again",
	},
};
