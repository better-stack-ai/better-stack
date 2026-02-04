"use client";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-editor-styles.css";

import { cn, throttle } from "../../../utils";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Slice } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import { useLayoutEffect, useRef, useState } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";

export function MarkdownEditor({
	value,
	onChange,
	className,
}: {
	value?: string;
	onChange?: (markdown: string) => void;
	className?: string;
}) {
	const { uploadImage, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const containerRef = useRef<HTMLDivElement | null>(null);
	const crepeRef = useRef<Crepe | null>(null);
	const isReadyRef = useRef(false);
	const [isReady, setIsReady] = useState(false);
	const onChangeRef = useRef<typeof onChange>(onChange);
	const initialValueRef = useRef<string>(value ?? "");
	type ThrottledFn = ((markdown: string) => void) & {
		cancel?: () => void;
		flush?: () => void;
	};
	const throttledOnChangeRef = useRef<ThrottledFn | null>(null);

	onChangeRef.current = onChange;

	useLayoutEffect(() => {
		if (crepeRef.current) return;
		const container = containerRef.current;
		if (!container) return;

		const crepe = new Crepe({
			root: container,
			defaultValue: initialValueRef.current,
			featureConfigs: {
				[CrepeFeature.Placeholder]: {
					text: localization.BLOG_FORMS_EDITOR_PLACEHOLDER,
				},
				[CrepeFeature.ImageBlock]: {
					onUpload: async (file) => {
						const url = await uploadImage(file);
						return url;
					},
				},
			},
		});

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

	return (
		<div ref={containerRef} className={cn("milkdown-custom", className)} />
	);
}
