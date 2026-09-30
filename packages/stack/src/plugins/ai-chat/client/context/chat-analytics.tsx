"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import { usePluginOverrides, useStack } from "@btst/stack/context";
import { usePageAIContext } from "./page-ai-context";
import { resolveAiChatMode, type AiChatPluginOverrides } from "../overrides";
import type { AiChatAnalyticsEvent } from "../analytics";

export const ChatAnalyticsPageKey = createContext<string | undefined>(
	undefined,
);
type EventDetails<T> = T extends unknown
	? Omit<T, "pageKey" | "routeName" | "mode">
	: never;

export function useChatAnalytics() {
	const { onAnalyticsEvent } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("aiChat", {});
	const { plugins } = useStack();
	const pageKey = useContext(ChatAnalyticsPageKey);
	const routeName = usePageAIContext()?.routeName;
	const latest = useRef({
		onAnalyticsEvent,
		pageKey,
		routeName,
		mode: resolveAiChatMode(plugins?.aiChat?.config),
	});
	latest.current = {
		onAnalyticsEvent,
		pageKey,
		routeName,
		mode: resolveAiChatMode(plugins?.aiChat?.config),
	};
	return useCallback((event: EventDetails<AiChatAnalyticsEvent>) => {
		const { onAnalyticsEvent: callback, ...context } = latest.current;
		try {
			void Promise.resolve(callback?.({ ...context, ...event })).catch(
				() => {},
			);
		} catch {
			// Optional instrumentation must never interrupt chat interactions.
		}
	}, []);
}
