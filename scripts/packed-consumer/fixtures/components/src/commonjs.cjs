const React = require("react");
const { z } = require("zod");
const { AutoForm, AutoFormSubmit } = require("@btst/components/auto-form");
const { SteppedAutoForm } = require("@btst/components/stepped-auto-form");
const { FormBuilder } = require("@btst/components/form-builder");
const {
	MarkdownContent,
	MarkdownEditor,
} = require("@btst/components/markdown");
const { MultipleSelector } = require("@btst/components/multi-select");
const { SearchSelect } = require("@btst/components/search-select");
const { Empty, EmptyTitle } = require("@btst/components/empty");

function CommonJSComponents() {
	const [value, setValue] = React.useState("");
	const [markdown, setMarkdown] = React.useState("CommonJS editor");
	return React.createElement(
		"main",
		{ id: "commonjs" },
		React.createElement(
			Empty,
			null,
			React.createElement(EmptyTitle, null, "CommonJS empty state"),
		),
		React.createElement(MarkdownContent, { markdown: "**CommonJS reader**" }),
		React.createElement(
			AutoForm,
			{
				formSchema: z.object({ title: z.string().min(1) }),
				onSubmit: (values) => setValue(values.title),
			},
			React.createElement(AutoFormSubmit, null, "Save CommonJS"),
		),
		React.createElement("output", { id: "commonjs-submitted" }, value),
		React.createElement(
			"section",
			{ id: "commonjs-editor" },
			React.createElement(MarkdownEditor, {
				value: markdown,
				onChange: setMarkdown,
			}),
			React.createElement("output", null, markdown),
		),
	);
}

module.exports = {
	CommonJSComponents,
	SteppedAutoForm,
	FormBuilder,
	MarkdownEditor,
	MultipleSelector,
	SearchSelect,
};
