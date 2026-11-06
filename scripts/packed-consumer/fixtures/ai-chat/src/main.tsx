import { aiChatClientPlugin, ChatLayout } from "@btst/plugin-ai-chat/client";
import { usePageAIContext } from "@btst/plugin-ai-chat/client/context";
import "@btst/plugin-ai-chat/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import {
	PageAIContextProvider,
	useRegisterPageAIContext,
} from "@btst/stack/page-context";
import { QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api/data" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: { aiChat: aiChatClientPlugin({ mode: "public" }) },
});

function Page() {
	useRegisterPageAIContext({
		routeName: "packed-probe",
		pageDescription: "Shared packed page context",
	});
	const context = usePageAIContext();
	return (
		<>
			<output id="packed-context">{context?.pageDescription}</output>
			<ChatLayout layout="widget" />
		</>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
	<PageAIContextProvider>
		<StackProvider stack={stack} router={{ navigate: () => undefined }}>
			<Page />
		</StackProvider>
	</PageAIContextProvider>,
);
