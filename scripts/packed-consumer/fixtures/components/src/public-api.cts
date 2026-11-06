import auto = require("@btst/components/auto-form");
import stepped = require("@btst/components/stepped-auto-form");
import builder = require("@btst/components/form-builder");
import markdown = require("@btst/components/markdown");
import multi = require("@btst/components/multi-select");
import search = require("@btst/components/search-select");
import empty = require("@btst/components/empty");

export type CommonJSStandalone = [
	typeof auto.AutoForm,
	typeof auto.AutoFormSubmit,
	auto.FieldConfig<{ title: string }>,
	typeof stepped.SteppedAutoForm,
	stepped.StepperComponentProps,
	typeof builder.FormBuilder,
	builder.JSONSchema,
	typeof markdown.MarkdownContent,
	markdown.MarkdownEditorProps,
	typeof multi.MultipleSelector,
	multi.Option,
	typeof search.SearchSelect,
	typeof empty.EmptyTitle,
];
const editor: markdown.MarkdownEditorProps = { value: "CommonJS" };
const invalid: markdown.MarkdownEditorProps = {
	// @ts-expect-error CommonJS consumers retain the same string callback contract.
	onChange: (value: number) => value.toFixed(),
};
void [editor, invalid];
