declare const components: {
	CommonJSComponents: import("react").ComponentType;
	SteppedAutoForm: typeof import("@btst/components/stepped-auto-form").SteppedAutoForm;
	FormBuilder: typeof import("@btst/components/form-builder").FormBuilder;
	MarkdownEditor: typeof import("@btst/components/markdown").MarkdownEditor;
	MultipleSelector: typeof import("@btst/components/multi-select").MultipleSelector;
	SearchSelect: typeof import("@btst/components/search-select").SearchSelect;
};
export = components;
