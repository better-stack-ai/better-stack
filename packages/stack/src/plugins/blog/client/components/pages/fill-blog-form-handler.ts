import type { RefObject } from "react";
import type { UseFormReturn } from "react-hook-form";

/**
 * Returns a `fillBlogForm` client tool handler bound to a form ref.
 * Used by both the new-post and edit-post pages so the field-mapping
 * logic stays in one place when the form schema changes.
 */
export function createFillBlogFormHandler(
	formRef: RefObject<UseFormReturn<any> | null>,
	successMessage: string,
) {
	return async ({
		title,
		content,
		excerpt,
		tags,
	}: {
		title?: string;
		content?: string;
		excerpt?: string;
		tags?: string[];
	}) => {
		const form = formRef.current;
		if (!form) return { success: false, message: "Form not ready" };
		if (title !== undefined)
			form.setValue("title", title, { shouldValidate: true });
		if (content !== undefined)
			form.setValue("content", content, { shouldValidate: true });
		if (excerpt !== undefined) form.setValue("excerpt", excerpt);
		if (tags !== undefined)
			form.setValue(
				"tags",
				tags.map((name: string) => ({ name })),
			);
		return { success: true, message: successMessage };
	};
}
