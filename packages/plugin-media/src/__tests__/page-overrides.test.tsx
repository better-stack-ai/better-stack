import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { mediaClientPlugin } from "../client/plugin";
import type { MediaPluginOverrides } from "../client/overrides";
import {
	AssetThumbnail,
	type AssetThumbnailProps,
} from "../client/components/media-picker/asset-thumbnail";

const props: AssetThumbnailProps = {
	asset: {
		id: "asset-1",
		url: "https://example.test/photo.png",
		mimeType: "image/png",
		originalName: "photo.png",
		alt: "Example photo",
	} as AssetThumbnailProps["asset"],
};
const pages = ["library"] as const;
function render(
	view: ReactElement,
	pageOverrides?: MediaPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ media: mediaClientPlugin() })}
			overrides={{ media: { ...{}, pageOverrides } }}
		>
			{view}
		</StackProvider>,
	);
}

describe("media page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: MediaPluginOverrides["pageOverrides"] = {
			library: {
				AssetThumbnail: (props) => (
					<article data-slot-name="library">
						{String(Boolean(props.asset))}
					</article>
				),
			},
		};
		for (const page of pages) {
			const html = render(
				<AssetThumbnail page={page} {...props} />,
				pageOverrides,
			);
			expect(html).toContain(`data-slot-name="${page}">true`);
			for (const other of pages.filter((candidate) => candidate !== page))
				expect(html).not.toContain(`data-slot-name="${other}"`);
		}
		expect(render(<AssetThumbnail {...props} />, pageOverrides)).toContain(
			'alt="Example photo"',
		);
		expect(render(<AssetThumbnail {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<AssetThumbnail page={page} {...props} />)).toContain(
				'alt="Example photo"',
			);
			expect(
				render(<AssetThumbnail page={page} {...props} />, { [page]: {} }),
			).toContain('alt="Example photo"');
		}
	});
});

import { LibraryPage } from "../client/components/pages/library-page.internal";
vi.mock("../client/hooks/use-media", () => ({
	useAssets: () => ({
		data: {
			pages: [
				{
					items: [
						{
							id: "asset-1",
							originalName: "photo.png",
							mimeType: "image/png",
							size: 42,
							url: "https://example.test/photo.png",
						},
					],
				},
			],
		},
	}),
	useDeleteAsset: () => ({}),
	useUploadAsset: () => ({}),
	useFolders: () => ({ data: [] }),
	useDeleteFolder: () => ({}),
	useCreateFolderForm: () => ({}),
}));
it("supplies library scope through BrowseTab and gated AssetCard into its thumbnail", () => {
	expect(
		render(<LibraryPage />, {
			library: {
				AssetThumbnail: ({ asset }) => (
					<div data-page="library">{asset.originalName}</div>
				),
			},
		}),
	).toContain('data-page="library">photo.png');
});
