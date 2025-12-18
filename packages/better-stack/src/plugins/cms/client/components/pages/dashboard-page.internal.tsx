"use client";

import { FileText } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { useSuspenseContentTypes } from "../../hooks";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { CMS_LOCALIZATION } from "../../localization";

export function DashboardPage() {
	const { navigate, localization: customLocalization } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const localization = { ...CMS_LOCALIZATION, ...customLocalization };
	const basePath = useBasePath();
	const { contentTypes } = useSuspenseContentTypes();

	if (contentTypes.length === 0) {
		return (
			<PageWrapper testId="cms-dashboard-page">
				<div className="w-full max-w-5xl space-y-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">
							{localization.CMS_DASHBOARD_TITLE}
						</h1>
						<p className="text-muted-foreground">
							{localization.CMS_DASHBOARD_SUBTITLE}
						</p>
					</div>
					<EmptyState
						title={localization.CMS_DASHBOARD_NO_TYPES}
						description={localization.CMS_DASHBOARD_NO_TYPES_DESCRIPTION}
					/>
				</div>
			</PageWrapper>
		);
	}

	const formatItemCount = (count: number) => {
		if (count === 0) return localization.CMS_DASHBOARD_ITEMS_COUNT_ZERO;
		if (count === 1) return localization.CMS_DASHBOARD_ITEMS_COUNT_ONE;
		return localization.CMS_DASHBOARD_ITEMS_COUNT.replace(
			"{count}",
			String(count),
		);
	};

	return (
		<PageWrapper testId="cms-dashboard-page">
			<div className="w-full max-w-5xl space-y-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">
						{localization.CMS_DASHBOARD_TITLE}
					</h1>
					<p className="text-muted-foreground">
						{localization.CMS_DASHBOARD_SUBTITLE}
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{contentTypes.map((ct) => (
						<Card
							key={ct.id}
							className="hover:border-primary/50 transition-colors cursor-pointer"
							onClick={() => navigate(`${basePath}/cms/${ct.slug}`)}
						>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-lg font-medium">{ct.name}</CardTitle>
								<FileText className="h-5 w-5 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{ct.itemCount}</div>
								<p className="text-xs text-muted-foreground">
									{formatItemCount(ct.itemCount)}
								</p>
								{ct.description && (
									<p className="text-sm text-muted-foreground mt-2 line-clamp-2">
										{ct.description}
									</p>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</PageWrapper>
	);
}
