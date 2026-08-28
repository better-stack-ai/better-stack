// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
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

function LayoutCallback({ callback }: { callback?: () => void }) {
	useLayoutEffect(() => callback?.(), [callback]);
	return null;
}

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
						aiChat: { mode: "authenticated", uploadFile },
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

	it("ignores an upload that completes after the input identity is replaced", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [aiChatPermissions] as const,
			rules: ({ aiChat }) => [aiChat.attachment.send.allow()],
		});
		const identity = { id: "owner-1" };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});
		let finishUpload: ((url: string) => void) | undefined;
		const uploadFile = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finishUpload = resolve;
				}),
		);
		const onFilesAttached = vi.fn();
		const notify = { success: vi.fn(), error: vi.fn() };

		const renderInput = async (
			identityKey: string,
			completeOldUploadInLayout = false,
		) => {
			await act(async () => {
				root.render(
					<StackProvider
						basePath="/pages"
						auth={auth}
						initialIdentity={identity}
						notify={notify}
						overrides={{
							aiChat: { mode: "authenticated", uploadFile },
						}}
					>
						<ChatInput
							key={identityKey}
							handleInputChange={() => {}}
							handleSubmit={() => {}}
							isLoading={false}
							attachedFiles={[]}
							onFilesAttached={onFilesAttached}
							attachmentPermissionFacts={{ ownerId: identity.id }}
						/>
						<LayoutCallback
							callback={
								completeOldUploadInLayout
									? () => finishUpload?.("https://files/secret.txt")
									: undefined
							}
						/>
					</StackProvider>,
				);
				await Promise.resolve();
			});
		};

		await renderInput("owner-1");
		const input =
			container.querySelector<HTMLInputElement>('input[type="file"]')!;
		Object.defineProperty(input, "files", {
			configurable: true,
			value: [new File(["secret"], "secret.txt", { type: "text/plain" })],
		});
		await act(async () => {
			input.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});
		expect(uploadFile).toHaveBeenCalledOnce();

		await renderInput("viewer-1", true);

		expect(onFilesAttached).not.toHaveBeenCalled();
		expect(notify.success).not.toHaveBeenCalled();
	});
});
