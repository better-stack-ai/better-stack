import type { ComponentProps } from "react";
import { z } from "zod";
import {
	AutoForm,
	AutoFormSubmit,
	type FieldConfig,
	type FieldConfigItem,
	type Dependency,
	type DependencyType,
	type AutoFormInputComponentProps,
	type ZodObjectOrWrapped,
} from "@btst/components/auto-form";
import {
	SteppedAutoForm,
	type SteppedAutoFormProps,
	type StepperComponentProps,
} from "@btst/components/stepped-auto-form";
import {
	FormBuilder,
	defaultComponents,
	defineComponent,
	objectFieldDefinition,
	arrayFieldDefinition,
	baseMetaSchema,
	baseMetaSchemaWithPlaceholder,
	type FormBuilderComponentDefinition,
	type FormBuilderField,
	type FormBuilderFieldProps,
	type JSONSchema,
	type JSONSchemaProperty,
	type StringFieldProps,
	type FormStep,
	type BackingType,
	type ComponentType,
	type TypedFieldProps,
} from "@btst/components/form-builder";
import {
	MarkdownContent,
	MarkdownEditor,
	type MarkdownContentProps,
	type MarkdownEditorProps,
} from "@btst/components/markdown";
import {
	MultipleSelector,
	type Option,
	type MultipleSelectorRef,
} from "@btst/components/multi-select";
import { SearchSelect } from "@btst/components/search-select";
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
	EmptyMedia,
} from "@btst/components/empty";

const schema = z.object({ title: z.string() });
const config: FieldConfig<z.infer<typeof schema>> = {
	title: { label: "Title" },
};
const props: ComponentProps<typeof AutoForm<typeof schema>> = {
	formSchema: schema,
	fieldConfig: config,
	onSubmit: (value) => {
		value.title.toUpperCase();
	},
};
const editor: MarkdownEditorProps = {
	value: "text",
	onChange: (value) => value.toUpperCase(),
};
const invalidEditor: MarkdownEditorProps = {
	// @ts-expect-error Markdown editor callbacks receive Markdown strings.
	onChange: (value: number) => value.toFixed(),
};
const search: ComponentProps<typeof SearchSelect> = {
	options: [{ label: "One", value: "one" }],
	value: "one",
	onChange: (value) => value.toUpperCase(),
};
const invalidSearch: ComponentProps<typeof SearchSelect> = {
	...search,
	// @ts-expect-error SearchSelect values remain strings.
	value: 1,
};
void [
	props,
	editor,
	invalidEditor,
	search,
	invalidSearch,
	AutoFormSubmit,
	SteppedAutoForm,
	FormBuilder,
	defaultComponents,
	defineComponent,
	objectFieldDefinition,
	arrayFieldDefinition,
	baseMetaSchema,
	baseMetaSchemaWithPlaceholder,
	MarkdownContent,
	MarkdownEditor,
	MultipleSelector,
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
	EmptyMedia,
];

export type StandaloneTypes = [
	FieldConfigItem,
	Dependency<{ title: string }>,
	DependencyType,
	AutoFormInputComponentProps,
	ZodObjectOrWrapped,
	SteppedAutoFormProps<typeof schema>,
	StepperComponentProps,
	FormBuilderComponentDefinition,
	FormBuilderField,
	FormBuilderFieldProps,
	JSONSchema,
	JSONSchemaProperty,
	StringFieldProps,
	FormStep,
	BackingType,
	ComponentType,
	TypedFieldProps,
	MarkdownContentProps,
	MarkdownEditorProps,
	Option,
	MultipleSelectorRef,
];
