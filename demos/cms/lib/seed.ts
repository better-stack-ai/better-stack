let seeded = false;

export async function seedCmsData(api: any) {
	if (seeded) return;
	seeded = true;

	try {
		// Check if articles already exist (getAllContentItems also calls ensureSynced)
		const existing = await api.cms.getAllContentItems("article", { limit: 1 });
		if (existing.items && existing.items.length > 0) return;

		await api.cms.createContentItem("article", {
			slug: "welcome-to-btst-cms",
			data: {
				title: "Welcome to BTST CMS",
				summary:
					"An introduction to managing structured content with the BTST CMS plugin.",
				body: "The BTST CMS plugin lets you define your content types as Zod schemas and get a fully functional headless CMS automatically.",
				publishedAt: new Date().toISOString(),
				published: true,
			},
		});

		await api.cms.createContentItem("article", {
			slug: "getting-started-with-content-types",
			data: {
				title: "Getting Started with Content Types",
				summary:
					"Learn how to define and manage content types in the BTST CMS plugin.",
				body: "Content types are defined as Zod schemas in your stack configuration. Each schema field maps to a form field in the CMS editor.",
				publishedAt: new Date(Date.now() - 86400000).toISOString(),
				published: true,
			},
		});

		await api.cms.createContentItem("article", {
			slug: "headless-cms-benefits",
			data: {
				title: "Benefits of a Headless CMS",
				summary:
					"Explore why headless CMS architecture is ideal for modern web applications.",
				body: "A headless CMS separates content management from presentation, giving developers full control over how content is displayed.",
				publishedAt: new Date(Date.now() - 172800000).toISOString(),
				published: false,
			},
		});

		console.log("[demo] CMS seed complete — 3 articles created");
	} catch (err) {
		console.error("[demo] CMS seed failed:", err);
	}
}
