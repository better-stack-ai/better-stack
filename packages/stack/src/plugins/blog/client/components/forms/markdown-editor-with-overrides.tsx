"use client";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";
import { MarkdownEditor, type MarkdownEditorProps } from "./markdown-editor";

type MarkdownEditorWithOverridesProps = Omit<
	MarkdownEditorProps,
	"uploadImage" | "placeholder"
>;

export function MarkdownEditorWithOverrides(
	props: MarkdownEditorWithOverridesProps,
) {
	const { uploadImage, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});

	return (
		<MarkdownEditor
			{...props}
			uploadImage={uploadImage}
			placeholder={localization?.BLOG_FORMS_EDITOR_PLACEHOLDER}
		/>
	);
}
