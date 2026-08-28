"use client";

import { FileText } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	usePluginOverrides,
	useBasePath,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { useSuspenseContentTypes } from "../../hooks";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

export function DashboardPage() {
	const t = useTranslate();
	const overrides = usePluginOverrides<CMSPluginOverrides>("cms");
	const { localization } = overrides;
	const { router } = useStack();
	const navigate = router?.navigate;
	const basePath = useBasePath();

	// Call route lifecycle hooks for telemetry and application behavior.
	useRouteLifecycle({
		routeName: "dashboard",
		context: {
			path: "/cms",
			isSSR: typeof window === "undefined",
		},
		overrides,
	});
	const { contentTypes } = useSuspenseContentTypes();

	const title =
		localization?.CMS_DASHBOARD_TITLE ?? t("cms.dashboard.title", "Content");
	const subtitle =
		localization?.CMS_DASHBOARD_SUBTITLE ??
		t("cms.dashboard.subtitle", "Manage your content types");

	if (contentTypes.length === 0) {
		return (
			<PageWrapper testId="cms-dashboard-page">
				<div className="w-full max-w-5xl space-y-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
						<p className="text-muted-foreground">{subtitle}</p>
					</div>
					<EmptyState
						title={
							localization?.CMS_DASHBOARD_NO_TYPES ??
							t("cms.dashboard.noTypes", "No content types configured")
						}
						description={
							localization?.CMS_DASHBOARD_NO_TYPES_DESCRIPTION ??
							t(
								"cms.dashboard.noTypesDescription",
								"Add content types to your CMS configuration to get started.",
							)
						}
					/>
				</div>
			</PageWrapper>
		);
	}

	const formatItemCount = (count: number) => {
		if (count === 0)
			return (
				localization?.CMS_DASHBOARD_ITEMS_COUNT_ZERO ??
				t("cms.dashboard.itemsCountZero", "No items")
			);
		if (count === 1)
			return (
				localization?.CMS_DASHBOARD_ITEMS_COUNT_ONE ??
				t("cms.dashboard.itemsCountOne", "1 item")
			);
		return (
			localization?.CMS_DASHBOARD_ITEMS_COUNT ??
			t("cms.dashboard.itemsCount", "{count} items")
		).replace("{count}", String(count));
	};

	return (
		<PageWrapper testId="cms-dashboard-page">
			<div className="w-full max-w-5xl space-y-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
					<p className="text-muted-foreground">{subtitle}</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{contentTypes.map((ct) => (
						<Card
							key={ct.id}
							className="hover:border-primary/50 transition-colors cursor-pointer"
							onClick={() => void navigate?.(`${basePath}/cms/${ct.slug}`)}
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
