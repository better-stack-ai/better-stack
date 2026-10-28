import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "../../../api";
import {
	cmsBackendPlugin,
	getContentItemById,
	getContentItemBySlug,
	getAllContentItems,
	getContentItemsByRelation,
	type CMSReadOptions,
} from "../api";
import {
	useContent,
	useContentItem,
	useContentItemBySlug,
	useSuspenseContent,
	useSuspenseContentItem,
	useContentByRelation,
	useSuspenseContentByRelation,
	useInverseRelationItems,
} from "../client/hooks";
import { createCMSQueryKeys } from "../query-keys";
import { createApiClient } from "../../client";
import type { CMSApiRouter } from "../api";

async function cmsContentReadTypes(
	adapter: DBAdapter,
	request: Request,
	options: CMSReadOptions,
) {
	const backend = createBackendStack({
		basePath: "/api",
		adapter: () => adapter,
		plugins: { cms: cmsBackendPlugin({ contentTypes: [] }) },
	});
	const full = await backend.trusted.cms.listContentItems({
		typeSlug: "article",
		query: {},
	});
	full.items[0]!.data satisfies string;
	const content = await backend.trusted.cms.listContentItems({
		typeSlug: "article",
		query: { view: "content" },
	});
	content.items[0]!.slug satisfies string;
	// @ts-expect-error Content view omits duplicated raw JSON.
	content.items[0]!.data;
	const item = await backend.forRequest(request).operations.cms.getContentItem({
		typeSlug: "article",
		id: "id",
		view: "content",
	});
	// @ts-expect-error Content view omits schema and editor metadata.
	item.contentType;
	const defaultItem = await backend.trusted.cms.getContentItem({
		typeSlug: "article",
		id: "id",
	});
	defaultItem.data satisfies string;
	const dynamic = await backend.trusted.cms.getContentItem({
		typeSlug: "article",
		id: "id",
		...options,
	});
	// @ts-expect-error A dynamic output view cannot promise raw JSON.
	dynamic.data;
	const getterItem = await getContentItemById(adapter, "id", {
		view: "content",
	});
	// @ts-expect-error Adapter getters have the same reduced envelope.
	getterItem?.authorId;
	(await getContentItemBySlug(adapter, "article", "slug"))?.data satisfies
		| string
		| undefined;
	const getterList = await getAllContentItems(adapter, "article", {
		view: "content",
	});
	// @ts-expect-error Content list getters omit duplicated raw JSON.
	getterList.items[0]?.data;
	const queries = createCMSQueryKeys(
		createApiClient<CMSApiRouter>({
			baseURL: "https://example.com",
			basePath: "/api",
		}),
	);
	(await queries.cmsContent.list({ typeSlug: "article" }).queryFn()).items[0]!
		.data satisfies string;
	const contentPage = await queries.cmsContent
		.list({ typeSlug: "article", view: "content" })
		.queryFn();
	// @ts-expect-error Content query factories omit the editor envelope too.
	contentPage.items[0]?.contentType;
	const queryItem = await queries.cmsContent
		.detail("article", "id", { view: "content" })
		.queryFn();
	// @ts-expect-error Content detail query factories omit duplicated raw JSON.
	queryItem?.data;
	const querySlug = await queries.cmsContent
		.bySlug("article", "slug", { view: "content" })
		.queryFn();
	// @ts-expect-error Content slug query factories omit duplicated raw JSON.
	querySlug?.data;
	const relationParams = { field: "authorId", targetId: "author-1" };
	(
		await backend.trusted.cms.listContentByRelation({
			typeSlug: "article",
			query: relationParams,
		})
	).items[0]!.data satisfies string;
	const related = await backend
		.forRequest(request)
		.operations.cms.listContentByRelation({
			typeSlug: "article",
			query: { ...relationParams, view: "content" },
		});
	// @ts-expect-error Content relation operations omit editor metadata.
	related.items[0]?.contentType;
	const inverseParams = { itemId: "author-1", fieldName: "authorId" };
	(
		await backend.trusted.cms.listInverseRelationItems({
			slug: "author",
			sourceType: "article",
			query: inverseParams,
		})
	).items[0]!.data satisfies string;
	const inverse = await backend.trusted.cms.listInverseRelationItems({
		slug: "author",
		sourceType: "article",
		query: { ...inverseParams, view: "content" },
	});
	// @ts-expect-error Content inverse operations omit raw JSON.
	inverse.items[0]?.data;
	const getterRelated = await getContentItemsByRelation(adapter, "article", {
		...relationParams,
		view: "content",
	});
	// @ts-expect-error Content relation getters omit raw JSON.
	getterRelated.items[0]?.data;
	(await getContentItemsByRelation(adapter, "article", relationParams))
		.items[0]!.data satisfies string;
	const relatedQuery = await queries.cmsContent
		.byRelation({ typeSlug: "article", ...relationParams, view: "content" })
		.queryFn();
	// @ts-expect-error Content relation query factories omit raw JSON.
	relatedQuery.items[0]?.data;
	(
		await queries.cmsContent
			.byRelation({ typeSlug: "article", ...relationParams })
			.queryFn()
	).items[0]!.data satisfies string;
	const inverseQuery = await queries.cmsTypes
		.inverseRelationItems({
			slug: "author",
			sourceType: "article",
			...inverseParams,
			view: "content",
		})
		.queryFn();
	// @ts-expect-error Content inverse query factories omit raw JSON.
	inverseQuery.items[0]?.data;
	(
		await queries.cmsTypes
			.inverseRelationItems({
				slug: "author",
				sourceType: "article",
				...inverseParams,
			})
			.queryFn()
	).items[0]!.data satisfies string;
}
void cmsContentReadTypes;

function useCMSContentReadTypes() {
	type Types = { article: { title: string; author: string } };
	useContent<Types, "article">("article").items[0]!.data satisfies string;
	const list = useContent<Types, "article">("article", { view: "content" });
	list.items[0]!.parsedData.author satisfies string;
	// @ts-expect-error Content hooks omit editor metadata with an explicit data map too.
	list.items[0]!.contentTypeId;
	const item = useContentItem<Types, "article">("article", "id", {
		view: "content",
	});
	item.item?.parsedData.title satisfies string | undefined;
	// @ts-expect-error Content detail hooks omit raw JSON.
	item.item?.data;
	// @ts-expect-error Content slug hooks omit raw JSON.
	useContentItemBySlug("article", "slug", { view: "content" }).item?.data;
	// @ts-expect-error Suspense content list hooks omit raw JSON.
	useSuspenseContent("article", { view: "content" }).items[0]?.data;
	// @ts-expect-error Suspense content detail hooks omit raw JSON.
	useSuspenseContentItem("article", "id", { view: "content" }).item?.data;
	useContentByRelation<Types, "article">("article", "authorId", "author-1")
		.items[0]!.data satisfies string;
	const related = useContentByRelation<Types, "article">(
		"article",
		"authorId",
		"author-1",
		{ view: "content" },
	);
	related.items[0]!.parsedData.author satisfies string;
	// @ts-expect-error Content relation hooks omit editor metadata with a data map.
	related.items[0]?.contentTypeId;
	const suspenseRelated = useSuspenseContentByRelation(
		"article",
		"authorId",
		"author-1",
		{
			view: "content",
		},
	);
	// @ts-expect-error Suspense relation hooks omit raw JSON.
	suspenseRelated.items[0]?.data;
	const inverse = useInverseRelationItems(
		{
			contentTypeSlug: "author",
			sourceType: "article",
			itemId: "author-1",
			fieldName: "authorId",
		},
		{ view: "content" },
	);
	// @ts-expect-error Content inverse hooks omit raw JSON.
	inverse.items[0]?.data;
}
void useCMSContentReadTypes;
