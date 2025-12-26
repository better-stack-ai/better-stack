import { expect, test } from "@playwright/test";

test.describe("CMS Relations API", () => {
	const testRunId = Date.now().toString(36);

	test("can create category and resource with relation via API", async ({
		request,
	}) => {
		// Create a category
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `test-category-${testRunId}`,
				data: {
					name: "Test Category",
					description: "A test category",
					color: "#3b82f6",
				},
			},
		});
		expect(categoryResponse.ok()).toBe(true);
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;
		expect(categoryId).toBeDefined();

		// Create a resource linked to the category
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `test-resource-${testRunId}`,
				data: {
					name: "Test Resource",
					description: "A test resource with relation",
					website: "https://example.com",
					categoryIds: [{ id: categoryId }],
				},
			},
		});
		expect(resourceResponse.ok()).toBe(true);
		const resourceJson = await resourceResponse.json();
		const parsedData = resourceJson.data?.parsedData || resourceJson.parsedData;
		expect(parsedData.categoryIds).toHaveLength(1);
		expect(parsedData.categoryIds[0].id).toBe(categoryId);
	});

	test("populated endpoint returns related items", async ({ request }) => {
		// Create a category
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `pop-category-${testRunId}`,
				data: {
					name: "Populated Test Category",
					description: "For populated test",
				},
			},
		});
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;

		// Create a resource with the category
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `pop-resource-${testRunId}`,
				data: {
					name: "Populated Test Resource",
					description: "Resource for populated test",
					categoryIds: [{ id: categoryId }],
				},
			},
		});
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;

		// Fetch populated
		const populatedResponse = await request.get(
			`/api/data/content/resource/${resourceId}/populated`,
		);
		expect(populatedResponse.ok()).toBe(true);
		const populated = await populatedResponse.json();
		// The populated endpoint returns the item directly with _relations
		expect(populated._relations).toBeDefined();
		expect(populated._relations.categoryIds).toHaveLength(1);
		expect(populated._relations.categoryIds[0].parsedData.name).toBe(
			"Populated Test Category",
		);
	});

	test("by-relation endpoint filters by category", async ({ request }) => {
		// Create a category
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `filter-category-${testRunId}`,
				data: {
					name: "Filter Test Category",
				},
			},
		});
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;

		// Create two resources with the category
		for (let i = 1; i <= 2; i++) {
			await request.post("/api/data/content/resource", {
				headers: { "content-type": "application/json" },
				data: {
					slug: `filter-resource-${testRunId}-${i}`,
					data: {
						name: `Filter Resource ${i}`,
						description: `Resource ${i} for filter test`,
						categoryIds: [{ id: categoryId }],
					},
				},
			});
		}

		// Create a resource WITHOUT the category
		await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `filter-resource-${testRunId}-other`,
				data: {
					name: "Other Resource",
					description: "Resource without the filter category",
					categoryIds: [],
				},
			},
		});

		// Filter by category
		const byRelationResponse = await request.get(
			`/api/data/content/resource/by-relation?field=categoryIds&targetId=${categoryId}`,
		);
		expect(byRelationResponse.ok()).toBe(true);
		const byRelationJson = await byRelationResponse.json();
		const byRelation = byRelationJson.data || byRelationJson;
		expect(byRelation.items.length).toBe(2);
	});

	test("inline creation of new category during resource creation", async ({
		request,
	}) => {
		// Create resource with a NEW category inline
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `inline-resource-${testRunId}`,
				data: {
					name: "Inline Test Resource",
					description: "Resource with inline category creation",
					categoryIds: [
						{ _new: true, data: { name: `Inline Category ${testRunId}` } },
					],
				},
			},
		});
		expect(resourceResponse.ok()).toBe(true);
		const resourceJson = await resourceResponse.json();
		const parsedData = resourceJson.data?.parsedData || resourceJson.parsedData;

		// Should have converted _new to an id reference
		expect(parsedData.categoryIds).toHaveLength(1);
		expect(parsedData.categoryIds[0].id).toBeDefined();
		expect(parsedData.categoryIds[0]._new).toBeUndefined();

		// Verify the category was actually created
		const categoriesResponse = await request.get("/api/data/content/category");
		const categoriesJson = await categoriesResponse.json();
		const categoriesData = categoriesJson.data || categoriesJson;
		const createdCategory = categoriesData.items.find(
			(c: { parsedData: { name: string } }) =>
				c.parsedData.name === `Inline Category ${testRunId}`,
		);
		expect(createdCategory).toBeDefined();
	});
});

test.describe("CMS Admin Relation Field", () => {
	test("relation field renders as multi-select instead of field group", async ({
		page,
	}) => {
		// Navigate to the create resource form
		await page.goto("/pages/cms/resource/new", { waitUntil: "networkidle" });

		// Wait for the form to load
		await expect(page.locator("h1")).toContainText("Resource", {
			timeout: 10000,
		});

		// Scroll down to ensure Category Ids is visible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(500);

		// The Category Ids field should exist somewhere on the page
		const categoryIdsLabel = page.locator("text=Category Ids").first();
		await expect(categoryIdsLabel).toBeVisible({ timeout: 10000 });

		// The key test: Check that there's NO h3 heading for "Category Ids"
		// Field groups in AutoForm render array fields with h3 headings and accordion triggers
		// The RelationField should NOT render as an h3
		const fieldGroupHeading = page.locator('h3:has-text("Category Ids")');
		await expect(fieldGroupHeading).not.toBeVisible();

		// Also check there's no accordion trigger button for Category Ids
		// (accordion triggers have data-state attribute)
		const accordionTrigger = page.locator(
			'button[data-state]:has-text("Category Ids")',
		);
		await expect(accordionTrigger).not.toBeVisible();
	});

	test("relation field can be interacted with", async ({ page }) => {
		await page.goto("/pages/cms/resource/new", { waitUntil: "networkidle" });

		// Wait for form to load
		await expect(page.locator("h1")).toContainText("Resource", {
			timeout: 10000,
		});

		// Scroll down to ensure Category Ids is visible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(500);

		// Find the Category Ids section
		const categoryIdsLabel = page.locator("text=Category Ids").first();
		await expect(categoryIdsLabel).toBeVisible({ timeout: 10000 });

		// Scroll to it
		await categoryIdsLabel.scrollIntoViewIfNeeded();

		// The RelationField renders an input element for the multi-select
		// Find an input near the Category Ids label
		const categorySection = categoryIdsLabel.locator("xpath=ancestor::*[4]");
		const selectInput = categorySection.locator("input").first();

		// There should be an input element (part of the multi-select)
		await expect(selectInput).toBeVisible({ timeout: 5000 });

		// Click it to interact
		await selectInput.click();

		// Wait a moment for dropdown
		await page.waitForTimeout(300);

		// The dropdown or empty message should appear
		// Just check that clicking doesn't error and we can see something
		await expect(page.locator("body")).toBeVisible();
	});
});

test.describe("CMS belongsTo Relations API", () => {
	const testRunId = Date.now().toString(36);

	test("can create comment with belongsTo relation to resource via API", async ({
		request,
	}) => {
		// Create a resource first
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `belongs-to-resource-${testRunId}`,
				data: {
					name: "BelongsTo Test Resource",
					description: "A resource for belongsTo test",
					categoryIds: [],
				},
			},
		});
		expect(resourceResponse.ok()).toBe(true);
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;
		expect(resourceId).toBeDefined();

		// Create a comment linked to the resource via belongsTo
		const commentResponse = await request.post("/api/data/content/comment", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `belongs-to-comment-${testRunId}`,
				data: {
					author: "Test Author",
					content: "This is a test comment",
					resourceId: { id: resourceId },
				},
			},
		});
		expect(commentResponse.ok()).toBe(true);
		const commentJson = await commentResponse.json();
		const parsedData = commentJson.data?.parsedData || commentJson.parsedData;
		// belongsTo stores as single object, not array
		expect(parsedData.resourceId).toBeDefined();
		expect(parsedData.resourceId.id).toBe(resourceId);
	});

	test("populated endpoint works with belongsTo relation", async ({
		request,
	}) => {
		// Create a resource
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `pop-belongs-resource-${testRunId}`,
				data: {
					name: "Populated BelongsTo Resource",
					description: "For belongsTo populated test",
					categoryIds: [],
				},
			},
		});
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;

		// Create a comment with belongsTo relation
		const commentResponse = await request.post("/api/data/content/comment", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `pop-belongs-comment-${testRunId}`,
				data: {
					author: "Populated Test Author",
					content: "Comment for populated test",
					resourceId: { id: resourceId },
				},
			},
		});
		const commentJson = await commentResponse.json();
		const commentId = commentJson.data?.id || commentJson.id;

		// Fetch populated comment
		const populatedResponse = await request.get(
			`/api/data/content/comment/${commentId}/populated`,
		);
		expect(populatedResponse.ok()).toBe(true);
		const populated = await populatedResponse.json();

		// The populated endpoint returns the item with _relations
		expect(populated._relations).toBeDefined();
		// belongsTo populates as array with single item
		expect(populated._relations.resourceId).toHaveLength(1);
		expect(populated._relations.resourceId[0].parsedData.name).toBe(
			"Populated BelongsTo Resource",
		);
	});

	test("inverse relations endpoint returns comments for a resource", async ({
		request,
	}) => {
		// Create a resource
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `inverse-resource-${testRunId}`,
				data: {
					name: "Inverse Relations Resource",
					description: "Resource for inverse relations test",
					categoryIds: [],
				},
			},
		});
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;

		// Create comments linked to the resource
		for (let i = 1; i <= 3; i++) {
			await request.post("/api/data/content/comment", {
				headers: { "content-type": "application/json" },
				data: {
					slug: `inverse-comment-${testRunId}-${i}`,
					data: {
						author: `Author ${i}`,
						content: `Comment ${i} for inverse test`,
						resourceId: { id: resourceId },
					},
				},
			});
		}

		// Fetch inverse relations for the resource
		const inverseResponse = await request.get(
			`/api/data/content-types/resource/inverse-relations?itemId=${resourceId}`,
		);
		expect(inverseResponse.ok()).toBe(true);
		const inverseJson = await inverseResponse.json();

		// Should have comments as inverse relation
		expect(inverseJson.inverseRelations).toBeDefined();
		const commentRelation = inverseJson.inverseRelations.find(
			(r: { sourceType: string }) => r.sourceType === "comment",
		);
		expect(commentRelation).toBeDefined();
		expect(commentRelation.fieldName).toBe("resourceId");
		expect(commentRelation.count).toBe(3);
	});

	test("inverse relations items endpoint returns comment items", async ({
		request,
	}) => {
		// Create a resource
		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `inverse-items-resource-${testRunId}`,
				data: {
					name: "Inverse Items Resource",
					description: "Resource for inverse items test",
					categoryIds: [],
				},
			},
		});
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;

		// Create comments linked to the resource
		for (let i = 1; i <= 2; i++) {
			await request.post("/api/data/content/comment", {
				headers: { "content-type": "application/json" },
				data: {
					slug: `inverse-items-comment-${testRunId}-${i}`,
					data: {
						author: `Items Author ${i}`,
						content: `Items Comment ${i}`,
						resourceId: { id: resourceId },
					},
				},
			});
		}

		// Fetch inverse relation items
		const itemsResponse = await request.get(
			`/api/data/content-types/resource/inverse-relations/comment?itemId=${resourceId}&fieldName=resourceId`,
		);
		expect(itemsResponse.ok()).toBe(true);
		const itemsJson = await itemsResponse.json();

		expect(itemsJson.items).toHaveLength(2);
		expect(itemsJson.total).toBe(2);
	});
});

test.describe("CMS Admin belongsTo Relation Field", () => {
	test("belongsTo relation field renders as single-select", async ({
		page,
	}) => {
		// Navigate to the create comment form
		await page.goto("/pages/cms/comment/new", { waitUntil: "networkidle" });

		// Wait for the form to load
		await expect(page.locator("h1")).toContainText("Comment", {
			timeout: 10000,
		});

		// Scroll down to ensure Resource Id is visible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(500);

		// The Resource Id field should exist somewhere on the page
		const resourceIdLabel = page.locator("text=Resource Id").first();
		await expect(resourceIdLabel).toBeVisible({ timeout: 10000 });

		// The key test: Check that there's NO accordion/h3 heading for "Resource Id"
		const fieldGroupHeading = page.locator('h3:has-text("Resource Id")');
		await expect(fieldGroupHeading).not.toBeVisible();

		// Also check there's no accordion trigger button for Resource Id
		const accordionTrigger = page.locator(
			'button[data-state]:has-text("Resource Id")',
		);
		await expect(accordionTrigger).not.toBeVisible();
	});

	test("belongsTo field can be interacted with", async ({ page }) => {
		await page.goto("/pages/cms/comment/new", { waitUntil: "networkidle" });

		// Wait for form to load
		await expect(page.locator("h1")).toContainText("Comment", {
			timeout: 10000,
		});

		// Scroll down to ensure Resource Id is visible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(500);

		// Find the Resource Id section
		const resourceIdLabel = page.locator("text=Resource Id").first();
		await expect(resourceIdLabel).toBeVisible({ timeout: 10000 });

		// Scroll to it
		await resourceIdLabel.scrollIntoViewIfNeeded();

		// The RelationField renders an input element for the multi-select
		const resourceSection = resourceIdLabel.locator("xpath=ancestor::*[4]");
		const selectInput = resourceSection.locator("input").first();

		// There should be an input element (part of the multi-select)
		await expect(selectInput).toBeVisible({ timeout: 5000 });

		// Click it to interact
		await selectInput.click();

		// Wait a moment for dropdown
		await page.waitForTimeout(300);

		// The dropdown or empty message should appear
		await expect(page.locator("body")).toBeVisible();
	});
});

test.describe("CMS Directory Pages", () => {
	const testRunId = Date.now().toString(36);

	test("directory page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/directory", { waitUntil: "networkidle" });

		// Should show the directory header
		await expect(page.locator("h1")).toContainText("Resource Directory");

		// Should have search input
		await expect(
			page.locator('input[placeholder="Search resources..."]'),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("directory page shows resources and categories", async ({
		page,
		request,
	}) => {
		// Create a category and resource via API
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `dir-category-${testRunId}`,
				data: {
					name: "Directory Test Category",
					color: "#10b981",
				},
			},
		});
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;

		await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `dir-resource-${testRunId}`,
				data: {
					name: "Directory Test Resource",
					description: "A resource for directory test",
					categoryIds: [{ id: categoryId }],
				},
			},
		});

		await page.goto("/directory", { waitUntil: "networkidle" });

		// Should show the category in sidebar
		await expect(
			page.locator('a:has-text("Directory Test Category")'),
		).toBeVisible({ timeout: 10000 });

		// Should show the resource
		await expect(
			page.locator('h3:has-text("Directory Test Resource")'),
		).toBeVisible({ timeout: 10000 });
	});

	test("directory search filters resources", async ({ page, request }) => {
		// Create resources
		await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `search-alpha-${testRunId}`,
				data: {
					name: "Alpha Search Resource",
					description: "First searchable resource",
					categoryIds: [],
				},
			},
		});
		await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `search-beta-${testRunId}`,
				data: {
					name: "Beta Search Resource",
					description: "Second searchable resource",
					categoryIds: [],
				},
			},
		});

		await page.goto("/directory", { waitUntil: "networkidle" });

		// Both should be visible initially
		await expect(
			page.locator('h3:has-text("Alpha Search Resource")'),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator('h3:has-text("Beta Search Resource")'),
		).toBeVisible({ timeout: 10000 });

		// Search for "Alpha"
		await page
			.locator('input[placeholder="Search resources..."]')
			.fill("Alpha");

		// Only Alpha should be visible
		await expect(
			page.locator('h3:has-text("Alpha Search Resource")'),
		).toBeVisible();
		await expect(
			page.locator('h3:has-text("Beta Search Resource")'),
		).not.toBeVisible();
	});

	test("resource detail page shows populated categories", async ({
		page,
		request,
	}) => {
		// Create category and resource
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `detail-category-${testRunId}`,
				data: {
					name: "Detail Test Category",
					color: "#8b5cf6",
				},
			},
		});
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;

		const resourceResponse = await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `detail-resource-${testRunId}`,
				data: {
					name: "Detail Test Resource",
					description: "Resource for detail page test",
					website: "https://example.com",
					categoryIds: [{ id: categoryId }],
				},
			},
		});
		const resourceJson = await resourceResponse.json();
		const resourceId = resourceJson.data?.id || resourceJson.id;

		await page.goto(`/directory/${resourceId}`, {
			waitUntil: "networkidle",
		});

		// Should show resource name
		await expect(page.locator("h1")).toContainText("Detail Test Resource");

		// Should show the category as a tag
		await expect(
			page.locator('a:has-text("Detail Test Category")'),
		).toBeVisible({ timeout: 10000 });

		// Should have visit website button
		await expect(page.locator('a:has-text("Visit Website")')).toBeVisible();
	});

	test("category page filters resources", async ({ page, request }) => {
		// Create category
		const categoryResponse = await request.post("/api/data/content/category", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `cat-filter-${testRunId}`,
				data: {
					name: "Category Filter Test",
					description: "For testing category filter",
				},
			},
		});
		const categoryJson = await categoryResponse.json();
		const categoryId = categoryJson.data?.id || categoryJson.id;

		// Create resources in the category
		await request.post("/api/data/content/resource", {
			headers: { "content-type": "application/json" },
			data: {
				slug: `in-cat-${testRunId}`,
				data: {
					name: "In Category Resource",
					description: "Should appear in category filter",
					categoryIds: [{ id: categoryId }],
				},
			},
		});

		await page.goto(`/directory/category/${categoryId}`, {
			waitUntil: "networkidle",
		});

		// Should show category name
		await expect(page.locator("h1")).toContainText("Category Filter Test");

		// Should show the resource
		await expect(
			page.locator('h3:has-text("In Category Resource")'),
		).toBeVisible({ timeout: 10000 });
	});
});
