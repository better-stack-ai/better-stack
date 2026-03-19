"use client";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-editor-styles.css";

import { cn, throttle } from "../../../utils";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Slice } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import {
	useLayoutEffect,
	useRef,
	useState,
	type MutableRefObject,
} from "react";

export interface MarkdownEditorProps {
	value?: string;
	onChange?: (markdown: string) => void;
	className?: string;
	/** Optional image upload handler. When provided, enables image upload in the editor. */
	uploadImage?: (file: File) => Promise<string>;
	/** Placeholder text shown when the editor is empty. */
	placeholder?: string;
	/**
	 * Optional ref that will be populated with an `insertImage(url)` function.
	 * Call `insertImageRef.current?.(url)` to programmatically insert an image.
	 * The URL is expected to be already encoded by the caller.
	 */
	insertImageRef?: MutableRefObject<((url: string) => void) | null>;
	/**
	 * When provided, clicking the Crepe image block's upload area opens a media
	 * picker instead of the native file dialog. The callback receives a `setUrl`
	 * function — call it with the chosen URL to set it into the image block.
	 * The URL passed to `setUrl` is expected to be already encoded by the caller.
	 */
	openMediaPickerForImageBlock?: (setUrl: (url: string) => void) => void;
}

export function MarkdownEditor({
	value,
	onChange,
	className,
	uploadImage,
	placeholder = "Write something...",
	insertImageRef,
	openMediaPickerForImageBlock,
}: MarkdownEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const crepeRef = useRef<Crepe | null>(null);
	const isReadyRef = useRef(false);
	const [isReady, setIsReady] = useState(false);
	const onChangeRef = useRef<typeof onChange>(onChange);
	const initialValueRef = useRef<string>(value ?? "");
	const openMediaPickerRef = useRef<typeof openMediaPickerForImageBlock>(
		openMediaPickerForImageBlock,
	);
	type ThrottledFn = ((markdown: string) => void) & {
		cancel?: () => void;
		flush?: () => void;
	};
	const throttledOnChangeRef = useRef<ThrottledFn | null>(null);

	onChangeRef.current = onChange;
	openMediaPickerRef.current = openMediaPickerForImageBlock;

	useLayoutEffect(() => {
		if (crepeRef.current) return;
		const container = containerRef.current;
		if (!container) return;

		const hasMediaPicker = !!openMediaPickerRef.current;

		const imageBlockConfig: Record<string, unknown> = {};
		if (uploadImage) {
			imageBlockConfig.onUpload = async (file: File) => uploadImage(file);
		}
		if (hasMediaPicker) {
			imageBlockConfig.blockUploadPlaceholderText = "Media Picker";
			imageBlockConfig.inlineUploadPlaceholderText = "Media Picker";
		}

		const crepe = new Crepe({
			root: container,
			defaultValue: initialValueRef.current,
			featureConfigs: {
				[CrepeFeature.Placeholder]: {
					text: placeholder,
				},
				...(Object.keys(imageBlockConfig).length > 0
					? { [CrepeFeature.ImageBlock]: imageBlockConfig }
					: {}),
			},
		});

		// Intercept clicks on Crepe image-block upload placeholders so that the
		// native file dialog is suppressed and the media picker is opened instead.
		const interceptHandler = (e: MouseEvent) => {
			if (!openMediaPickerRef.current) return;
			const target = e.target as Element;
			// Only intercept clicks inside the upload placeholder area.
			const inPlaceholder = target.closest(".image-edit .placeholder");
			if (!inPlaceholder) return;
			// Let the hidden file <input> itself through (shouldn't receive clicks normally).
			if ((target as HTMLElement).matches("input")) return;

			e.preventDefault();
			e.stopPropagation();

			const imageEdit = inPlaceholder.closest(".image-edit");
			const linkInput = imageEdit?.querySelector(
				".link-input-area",
			) as HTMLInputElement | null;

			openMediaPickerRef.current((url: string) => {
				if (!linkInput) return;
				// Use the native setter so Vue's reactivity picks up the change.
				const nativeSetter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				nativeSetter?.call(linkInput, url);
				linkInput.dispatchEvent(new Event("input", { bubbles: true }));
				linkInput.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
				);
			});
		};
		container.addEventListener("click", interceptHandler, true);

		// Prepare throttled onChange once per editor instance
		throttledOnChangeRef.current = throttle((markdown: string) => {
			if (onChangeRef.current) onChangeRef.current(markdown);
		}, 200);

		crepe.editor
			.config((ctx) => {
				ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
					throttledOnChangeRef.current?.(markdown);
				});
			})
			.use(listener);

		crepe.create().then(() => {
			isReadyRef.current = true;
			setIsReady(true);
		});
		crepeRef.current = crepe;

		return () => {
			container.removeEventListener("click", interceptHandler, true);
			try {
				isReadyRef.current = false;
				throttledOnChangeRef.current?.cancel?.();
				throttledOnChangeRef.current = null;
				crepe.destroy();
			} finally {
				crepeRef.current = null;
			}
		};
	}, []);

	useLayoutEffect(() => {
		if (!isReady) return;
		if (!crepeRef.current) return;
		if (typeof value !== "string") return;

		let currentMarkdown: string | undefined;
		try {
			currentMarkdown = crepeRef.current?.getMarkdown?.();
		} catch {
			// Editor may not have finished initializing its view/state; skip sync for now
			return;
		}

		if (currentMarkdown === value) return;

		crepeRef.current.editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			if (view?.hasFocus?.() === true) return;
			const parser = ctx.get(parserCtx);
			const doc = parser(value);
			if (!doc) return;

			const state = view.state;
			const selection = state.selection;
			const from = selection.from;

			let tr = state.tr;
			tr = tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0));

			const docSize = doc.content.size;
			const safeFrom = Math.max(1, Math.min(from, Math.max(1, docSize - 2)));
			tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)));
			view.dispatch(tr);
		});
	}, [value, isReady]);

	// Expose insertImage via ref so the parent can insert images programmatically
	useLayoutEffect(() => {
		if (!insertImageRef) return;
		insertImageRef.current = (url: string) => {
			if (!crepeRef.current || !isReadyRef.current) return;
			try {
				const currentMarkdown = crepeRef.current.getMarkdown?.() ?? "";
				const imageMarkdown = `\n\n![](${url})\n\n`;
				const newMarkdown = currentMarkdown.trimEnd() + imageMarkdown;
				crepeRef.current.editor.action((ctx) => {
					const view = ctx.get(editorViewCtx);
					const parser = ctx.get(parserCtx);
					const doc = parser(newMarkdown);
					if (!doc) return;
					const state = view.state;
					const tr = state.tr.replace(
						0,
						state.doc.content.size,
						new Slice(doc.content, 0, 0),
					);
					view.dispatch(tr);
				});
				if (onChangeRef.current) onChangeRef.current(newMarkdown);
			} catch {
				// Editor may not be ready yet
			}
		};
		return () => {
			if (insertImageRef) insertImageRef.current = null;
		};
	}, [insertImageRef]);

	return (
		<div ref={containerRef} className={cn("milkdown-custom", className)} />
	);
}
