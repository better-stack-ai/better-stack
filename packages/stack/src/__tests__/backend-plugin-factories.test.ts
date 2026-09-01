import { describe, expect, it } from "vitest";
import { aiChatBackendPlugin } from "../plugins/ai-chat/api";
import { blogBackendPlugin } from "../plugins/blog/api";
import { cmsBackendPlugin } from "../plugins/cms/api";
import { commentsBackendPlugin } from "../plugins/comments/api";
import { formBuilderBackendPlugin } from "../plugins/form-builder/api";
import { kanbanBackendPlugin } from "../plugins/kanban/api";
import {
	mediaBackendPlugin,
	type DirectStorageAdapter,
} from "../plugins/media/api";
import { openApiBackendPlugin } from "../plugins/open-api/api";

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
