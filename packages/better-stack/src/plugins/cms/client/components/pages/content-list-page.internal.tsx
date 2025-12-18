"use client";

import { Plus, ArrowLeft, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import {
	useSuspenseContent,
	useSuspenseContentTypes,
	useDeleteContent,
} from "../../hooks";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { CMS_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { toast } from "sonner";

interface ContentListPageProps {
	typeSlug: string;
}

export function ContentListPage({ typeSlug }: ContentListPageProps) {
	const overrides = usePluginOverrides<CMSPluginOverrides>("cms");
	const { navigate, Link } = overrides;
	const localization = { ...CMS_LOCALIZATION, ...overrides.localization };
	const basePath = useBasePath();

	// Call lifecycle hooks for authorization
	useRouteLifecycle({
		routeName: "contentList",
		context: {
			path: `/cms/${typeSlug}`,
			params: { typeSlug },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeListRendered) {
				return overrides.onBeforeListRendered(typeSlug, context);
			}
			return true;
		},
	});

	const limit = 20;

	const { contentTypes } = useSuspenseContentTypes();
	const contentType = contentTypes.find((ct) => ct.slug === typeSlug);

	const { items, total, refetch, loadMore, hasMore, isLoadingMore } =
		useSuspenseContent(typeSlug, {
			limit,
		});

	const deleteContent = useDeleteContent(typeSlug);

	const LinkComponent = Link || "a";

	const handleDelete = async (id: string) => {
		try {
			await deleteContent.mutateAsync(id);
			toast.success(localization.CMS_TOAST_DELETE_SUCCESS);
			void refetch();
		} catch {
			toast.error(localization.CMS_TOAST_ERROR);
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString();
	};

	if (!contentType) {
		return (
			<PageWrapper testId="cms-list-page">
				<div className="w-full max-w-5xl">
					<EmptyState
						title={localization.CMS_ERROR_NOT_FOUND}
						description="Content type not found"
					/>
				</div>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper testId="cms-list-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => navigate(`${basePath}/cms`)}
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="text-2xl font-bold tracking-tight">
								{contentType.name}
							</h1>
							{contentType.description && (
								<p className="text-muted-foreground">
									{contentType.description}
								</p>
							)}
						</div>
					</div>
					<Button onClick={() => navigate(`${basePath}/cms/${typeSlug}/new`)}>
						<Plus className="h-4 w-4 mr-2" />
						{localization.CMS_BUTTON_NEW_ITEM}
					</Button>
				</div>

				{items.length === 0 ? (
					<EmptyState
						title={localization.CMS_LIST_EMPTY}
						description={localization.CMS_LIST_EMPTY_DESCRIPTION}
						action={
							<Button
								onClick={() => navigate(`${basePath}/cms/${typeSlug}/new`)}
							>
								<Plus className="h-4 w-4 mr-2" />
								{localization.CMS_BUTTON_CREATE}
							</Button>
						}
					/>
				) : (
					<div className="border rounded-lg">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{localization.CMS_LIST_COLUMN_SLUG}</TableHead>
									<TableHead>{localization.CMS_LIST_COLUMN_CREATED}</TableHead>
									<TableHead>{localization.CMS_LIST_COLUMN_UPDATED}</TableHead>
									<TableHead className="w-[100px]">
										{localization.CMS_LIST_COLUMN_ACTIONS}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="font-medium">
											<LinkComponent
												href={`${basePath}/cms/${typeSlug}/${item.id}`}
												className="hover:underline"
											>
												{item.slug}
											</LinkComponent>
										</TableCell>
										<TableCell>{formatDate(item.createdAt)}</TableCell>
										<TableCell>{formatDate(item.updatedAt)}</TableCell>
										<TableCell>
											<div className="flex items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													onClick={() =>
														navigate(`${basePath}/cms/${typeSlug}/${item.id}`)
													}
												>
													<Pencil className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => handleDelete(item.id)}
													disabled={deleteContent.isPending}
												>
													<Trash2 className="h-4 w-4 text-destructive" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						{/* Load More and pagination info */}
						<div className="flex items-center justify-between px-4 py-3 border-t">
							<p className="text-sm text-muted-foreground">
								{localization.CMS_LIST_PAGINATION_SHOWING.replace("{from}", "1")
									.replace("{to}", String(items.length))
									.replace("{total}", String(total))}
							</p>
							{hasMore && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => loadMore()}
									disabled={isLoadingMore}
								>
									{isLoadingMore && (
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									)}
									{localization.CMS_LIST_PAGINATION_NEXT}
								</Button>
							)}
						</div>
					</div>
				)}
			</div>
		</PageWrapper>
	);
}
