"use client";

import { useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2 } from "lucide-react";
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
import { Pagination } from "../shared/pagination";
import { CMS_LOCALIZATION } from "../../localization";
import { toast } from "sonner";

interface ContentListPageProps {
	typeSlug: string;
}

export function ContentListPage({ typeSlug }: ContentListPageProps) {
	const {
		navigate,
		Link,
		localization: customLocalization,
	} = usePluginOverrides<CMSPluginOverrides>("cms");
	const localization = { ...CMS_LOCALIZATION, ...customLocalization };
	const basePath = useBasePath();

	const [page, setPage] = useState(1);
	const limit = 20;
	const offset = (page - 1) * limit;

	const { contentTypes } = useSuspenseContentTypes();
	const contentType = contentTypes.find((ct) => ct.slug === typeSlug);

	const { items, total, refetch } = useSuspenseContent(typeSlug, {
		limit,
		offset,
	});

	const deleteContent = useDeleteContent(typeSlug);

	const totalPages = Math.ceil(total / limit);

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
			<EmptyState
				title={localization.CMS_ERROR_NOT_FOUND}
				description="Content type not found"
			/>
		);
	}

	return (
		<div className="space-y-6">
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
							<p className="text-muted-foreground">{contentType.description}</p>
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
						<Button onClick={() => navigate(`${basePath}/cms/${typeSlug}/new`)}>
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
					<Pagination
						currentPage={page}
						totalPages={totalPages}
						onPageChange={setPage}
						total={total}
						limit={limit}
						offset={offset}
					/>
				</div>
			)}
		</div>
	);
}
