import { describe, expect, it } from "vitest";
import { aiChatBackendPlugin } from "@btst/plugin-ai-chat/api";
import { blogBackendPlugin } from "@btst/plugin-blog/api";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { commentsBackendPlugin } from "@btst/plugin-comments/api";
import { formBuilderBackendPlugin } from "@btst/plugin-form-builder/api";
import { kanbanBackendPlugin } from "@btst/plugin-kanban/api";
import {
	mediaBackendPlugin,
	type DirectStorageAdapter,
} from "@btst/plugin-media/api";
import { openApiBackendPlugin } from "@btst/plugin-open-api/api";

const storageAdapter: DirectStorageAdapter = {
	type: "local",
	upload: async (_buffer, { filename }) => ({
		url: `https://files.example/${filename}`,
	}),
	delete: async () => undefined,
};

describe("first-party backend plugin factories", () => {
	it("exposes the canonical literal ID for all eight backend plugins", () => {
		const plugins = [
			aiChatBackendPlugin({ model: {} as never }),
			blogBackendPlugin(),
			cmsBackendPlugin({ contentTypes: [] }),
			commentsBackendPlugin(),
			formBuilderBackendPlugin(),
			kanbanBackendPlugin(),
			mediaBackendPlugin({ storageAdapter }),
			openApiBackendPlugin(),
		];

		expect(plugins.map((plugin) => plugin.id)).toEqual([
			"aiChat",
			"blog",
			"cms",
			"comments",
			"formBuilder",
			"kanban",
			"media",
			"openApi",
		]);
	});

	it("keeps every optional-only factory callable without an options object", () => {
		expect(blogBackendPlugin().id).toBe("blog");
		expect(commentsBackendPlugin().id).toBe("comments");
		expect(formBuilderBackendPlugin().id).toBe("formBuilder");
		expect(kanbanBackendPlugin().id).toBe("kanban");
		expect(openApiBackendPlugin().id).toBe("openApi");
	});
});
