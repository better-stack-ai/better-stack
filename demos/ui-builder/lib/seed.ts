import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";

let seeded = false;

export async function seedUIBuilderData(api: any) {
	if (seeded) return;
	seeded = true;

	try {
		// This also calls ensureSynced internally
		const existing = await api.cms.getAllContentItems(UI_BUILDER_TYPE_SLUG, {
			limit: 1,
		});
		if (existing.items && existing.items.length > 0) return;

		// A simple hero + features page layout
		const layers = JSON.stringify([
			{
				id: "hero",
				type: "div",
				props: {
					className:
						"flex flex-col items-center justify-center min-h-[50vh] bg-gradient-to-b from-background to-muted text-center px-4 py-16 gap-6",
				},
				children: [
					{
						id: "hero-title",
						type: "h1",
						props: {
							className: "text-5xl font-bold tracking-tight",
							children: "Welcome to BTST UI Builder",
						},
					},
					{
						id: "hero-subtitle",
						type: "p",
						props: {
							className: "text-xl text-muted-foreground max-w-2xl",
							children:
								"Build beautiful pages visually with the drag-and-drop UI Builder plugin.",
						},
					},
					{
						id: "hero-cta",
						type: "a",
						props: {
							href: "/pages/ui-builder",
							className:
								"inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors",
							children: "Open the Builder →",
						},
					},
				],
			},
			{
				id: "features",
				type: "div",
				props: {
					className:
						"container mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-3 gap-8",
				},
				children: [
					{
						id: "feature-1",
						type: "div",
						props: {
							className: "flex flex-col gap-3 p-6 rounded-xl border bg-card",
						},
						children: [
							{
								id: "feature-1-title",
								type: "h3",
								props: {
									className: "text-lg font-semibold",
									children: "🎨 Visual Drag & Drop",
								},
							},
							{
								id: "feature-1-body",
								type: "p",
								props: {
									className: "text-muted-foreground text-sm",
									children:
										"Build pages without writing code. Drag components, adjust props, and preview instantly.",
								},
							},
						],
					},
					{
						id: "feature-2",
						type: "div",
						props: {
							className: "flex flex-col gap-3 p-6 rounded-xl border bg-card",
						},
						children: [
							{
								id: "feature-2-title",
								type: "h3",
								props: {
									className: "text-lg font-semibold",
									children: "💾 CMS-Backed",
								},
							},
							{
								id: "feature-2-body",
								type: "p",
								props: {
									className: "text-muted-foreground text-sm",
									children:
										"Pages are stored as CMS content items — version-controlled, queryable, and deployable.",
								},
							},
						],
					},
					{
						id: "feature-3",
						type: "div",
						props: {
							className: "flex flex-col gap-3 p-6 rounded-xl border bg-card",
						},
						children: [
							{
								id: "feature-3-title",
								type: "h3",
								props: {
									className: "text-lg font-semibold",
									children: "🔌 Extensible",
								},
							},
							{
								id: "feature-3-body",
								type: "p",
								props: {
									className: "text-muted-foreground text-sm",
									children:
										"Bring your own component registry. Use any shadcn/ui components or your own design system.",
								},
							},
						],
					},
				],
			},
		]);

		await api.cms.createContentItem(UI_BUILDER_TYPE_SLUG, {
			slug: "welcome",
			data: {
				layers,
				variables: "[]",
				status: "published",
			},
		});

		console.log("[demo] UI Builder seed complete — 1 sample page created");
	} catch (err) {
		console.error("[demo] UI Builder seed failed:", err);
	}
}
