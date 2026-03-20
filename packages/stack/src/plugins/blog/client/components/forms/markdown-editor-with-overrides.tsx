"use client";
import { useCallback, useRef } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";
import { MarkdownEditor, type MarkdownEditorProps } from "./markdown-editor";

type MarkdownEditorWithOverridesProps = Omit<
	MarkdownEditorProps,
	| "uploadImage"
	| "placeholder"
	| "insertImageRef"
	| "openMediaPickerForImageBlock"
>;

export function MarkdownEditorWithOverrides(
	props: MarkdownEditorWithOverridesProps,
) {
	const {
		uploadImage,
		imagePicker: ImagePickerTrigger,
		localization,
	} = usePluginOverrides<BlogPluginOverrides, Partial<BlogPluginOverrides>>(
		"blog",
		{ localization: BLOG_LOCALIZATION },
	);

	const insertImageRef = useRef<((url: string) => void) | null>(null);
	// Holds the Crepe-image-block `setUrl` callback while the picker is open.
	const pendingInsertUrlRef = useRef<((url: string) => void) | null>(null);
	// Ref to the trigger wrapper so we can programmatically click the picker button.
	const triggerContainerRef = useRef<HTMLDivElement | null>(null);

	// Single onSelect handler for ImagePickerTrigger.
	// URLs returned by the media plugin are already percent-encoded at the
	// source (storage adapter), so no additional encoding is applied here.
	const handleSelect = useCallback((url: string) => {
		if (pendingInsertUrlRef.current) {
			// Crepe image block flow: set the URL into the block's link input.
			pendingInsertUrlRef.current(url);
			pendingInsertUrlRef.current = null;
		} else {
			// Normal flow: insert image at end of markdown content.
			insertImageRef.current?.(url);
		}
	}, []);

	// Called by MarkdownEditor's click interceptor when the user clicks a Crepe
	// image-block upload placeholder.
	const openMediaPickerForImageBlock = useCallback(
		(setUrl: (url: string) => void) => {
			pendingInsertUrlRef.current = setUrl;
			// Programmatically click the visible picker trigger button.
			const btn = triggerContainerRef.current?.querySelector(
				'[data-testid="open-media-picker"]',
			) as HTMLButtonElement | null;
			btn?.click();
		},
		[],
	);

	return (
		<div className="flex flex-col">
			<MarkdownEditor
				{...props}
				uploadImage={uploadImage}
				placeholder={localization?.BLOG_FORMS_EDITOR_PLACEHOLDER}
				insertImageRef={insertImageRef}
				openMediaPickerForImageBlock={
					ImagePickerTrigger ? openMediaPickerForImageBlock : undefined
				}
			/>
			{ImagePickerTrigger && (
				<div
					ref={triggerContainerRef}
					className="flex justify-end mt-1"
					data-testid="image-picker-trigger"
				>
					<ImagePickerTrigger onSelect={handleSelect} />
				</div>
			)}
		</div>
	);
}
