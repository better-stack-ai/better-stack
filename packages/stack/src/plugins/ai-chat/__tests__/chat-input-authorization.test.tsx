// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { StackProvider } from "@btst/stack/context";
import { ChatInput } from "../client/components/chat-input";
import { aiChatPermissions } from "../permissions";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("AI Chat attachment authorization", () => {
	it("checks the selected MIME type before calling the upload transport", async () => {
		const observedMediaTypes: string[][] = [];
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [aiChatPermissions] as const,
			rules: ({ aiChat }) => [
				aiChat.attachment.send.when(({ facts }) => {
					observedMediaTypes.push([...facts.mediaTypes]);
					return facts.mediaTypes.every((type) => type === "image/png");
				}),
			],
		});
		const identity = { id: "owner-1" };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});
		const uploadFile = vi.fn(
			async (file: File) => `https://files/${file.name}`,
		);
		const notify = { success: vi.fn(), error: vi.fn() };

		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					auth={auth}
					initialIdentity={identity}
					notify={notify}
					overrides={{
						"ai-chat": { mode: "authenticated", uploadFile },
					}}
				>
					<ChatInput
						handleInputChange={() => {}}
						handleSubmit={() => {}}
						isLoading={false}
						attachmentPermissionFacts={{ ownerId: identity.id }}
					/>
				</StackProvider>,
			);
			await Promise.resolve();
		});

		const input =
			container.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input).toBeTruthy();
		Object.defineProperty(input!, "files", {
			configurable: true,
			value: [new File(["no"], "notes.txt", { type: "text/plain" })],
		});
		await act(async () => {
			input!.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});
		expect(uploadFile).not.toHaveBeenCalled();
		expect(notify.error).toHaveBeenCalledOnce();

		Object.defineProperty(input!, "files", {
			configurable: true,
			value: [new File(["yes"], "image.png", { type: "image/png" })],
		});
		await act(async () => {
			input!.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(uploadFile).toHaveBeenCalledOnce();
		expect(observedMediaTypes).toContainEqual(["text/plain"]);
		expect(observedMediaTypes).toContainEqual(["image/png"]);
	});
});
