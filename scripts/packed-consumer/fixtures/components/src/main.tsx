import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import {
	AutoForm,
	AutoFormSubmit,
	type AutoFormInputComponentProps,
} from "@btst/components/auto-form";
import { SteppedAutoForm } from "@btst/components/stepped-auto-form";
import { FormBuilder, type JSONSchema } from "@btst/components/form-builder";
import { MarkdownContent, MarkdownEditor } from "@btst/components/markdown";
import { MultipleSelector, type Option } from "@btst/components/multi-select";
import { SearchSelect } from "@btst/components/search-select";
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
	EmptyMedia,
} from "@btst/components/empty";
import "@btst/components/markdown/css";
import "@btst/components/ui/css";

const formSchema = z.object({ title: z.string().min(2) });
const stepsSchema = z
	.object({
		first: z.string().min(1).meta({ stepGroup: 0 }),
		last: z.string().min(1).meta({ stepGroup: 1 }),
	})
	.meta({
		steps: [
			{ id: "first", title: "First" },
			{ id: "last", title: "Last" },
		],
		stepGroupMap: { first: 0, last: 1 },
	});

function ConsumerField({ field, label }: AutoFormInputComponentProps) {
	const { getFieldState, formState } = useFormContext();
	const error = getFieldState(field.name, formState).error;
	return (
		<label>
			{label}
			<input {...field} aria-invalid={!!error} />
			{error && <span role="alert">{String(error.message)}</span>}
		</label>
	);
}

function App() {
	const [submitted, setSubmitted] = useState("");
	const [steps, setSteps] = useState("");
	const [markdown, setMarkdown] = useState("Initial editor text");
	const [selected, setSelected] = useState<Option[]>([]);
	const [search, setSearch] = useState("");
	const [schema, setSchema] = useState<JSONSchema>({
		type: "object",
		properties: { message: { type: "string", title: "Message" } },
	});
	return (
		<main>
			<section id="reader">
				<MarkdownContent
					markdown={
						"## Packed reader\n\n[Profile](/profile) and **strong** text."
					}
					LinkComponent={(props) => (
						<a {...props} target="_blank" rel="noopener" />
					)}
				/>
			</section>
			<section id="form">
				<AutoForm
					formSchema={formSchema}
					fieldConfig={{ title: { label: "Title", fieldType: ConsumerField } }}
					onSubmit={(values) => setSubmitted(values.title)}
				>
					<AutoFormSubmit>Save standalone</AutoFormSubmit>
				</AutoForm>
				<output>{submitted}</output>
			</section>
			<section id="steps">
				<SteppedAutoForm
					formSchema={stepsSchema}
					onSubmit={(values) => setSteps(`${values.first} ${values.last}`)}
				/>
				<output>{steps}</output>
			</section>
			<section id="builder">
				<FormBuilder value={schema} onChange={setSchema} />
				<output>{JSON.stringify(schema)}</output>
			</section>
			<section id="editor">
				<MarkdownEditor value={markdown} onChange={setMarkdown} />
				<output>{markdown}</output>
			</section>
			<section id="multi">
				<MultipleSelector
					options={[
						{ value: "one", label: "First choice" },
						{ value: "two", label: "Second choice" },
					]}
					value={selected}
					onChange={setSelected}
					placeholder="Choose several"
				/>
				<output>{selected.map((option) => option.value).join(",")}</output>
			</section>
			<section id="search">
				<SearchSelect
					options={[{ value: "found", label: "Found option" }]}
					value={search}
					onChange={setSearch}
					placeholder="Choose one"
				/>
				<output>{search}</output>
			</section>
			<Empty>
				<EmptyMedia>—</EmptyMedia>
				<EmptyHeader>
					<EmptyTitle>No records</EmptyTitle>
					<EmptyDescription>Standalone empty state</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>Nothing selected</EmptyContent>
			</Empty>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
