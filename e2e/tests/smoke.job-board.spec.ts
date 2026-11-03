import { expect, test } from "@playwright/test";
import { mockAuthHeaders } from "./helpers/mock-auth";

test("guest filters open jobs and submits the assigned application form", async ({
	page,
	request,
}, testInfo) => {
	const runId = Date.now().toString(36);
	const department = "Sales / Marketing ~ 50%";
	const slug = `job-board-${runId}`;
	const title = `Product engineer ${runId}`;
	const formResponse = await request.post("/api/data/forms", {
		headers: mockAuthHeaders(),
		data: {
			name: `Job application ${runId}`,
			slug: `${slug}-application`,
			status: "active",
			successMessage: "Your application has been received.",
			schema: JSON.stringify({
				type: "object",
				properties: {
					name: { type: "string", title: "Your name" },
					email: { type: "string", format: "email", title: "Email" },
				},
				required: ["name", "email"],
			}),
		},
	});
	expect(formResponse.ok(), await formResponse.text()).toBe(true);
	const form = (await formResponse.json()) as { id: string };
	const jobIds: string[] = [];

	try {
		for (const variant of ["open", "onsite", "draft", "expired"]) {
			const response = await request.post("/api/data/content/job-posting", {
				headers: mockAuthHeaders(),
				data: {
					slug: variant === "open" ? slug : `${slug}-${variant}`,
					data: {
						title: variant === "open" ? title : `${variant} ${title}`,
						department,
						location: "London",
						employmentType: "full-time",
						remote: variant !== "onsite",
						description:
							"Build accessible tools for the people using our product.",
						requirements:
							"Experience shipping and maintaining web applications.",
						status: variant === "draft" ? "draft" : "published",
						...(variant === "expired" ? { closingDate: "2000-01-01" } : {}),
						...(variant === "open" ? { applicationFormId: form.id } : {}),
					},
				},
			});
			expect(response.ok(), await response.text()).toBe(true);
			jobIds.push((await response.json()).id);
		}

		expect((await request.get("/api/data/content/job-posting")).status()).toBe(
			401,
		);
		for (const hidden of ["draft", "expired"]) {
			expect(
				(await request.get(`/api/data/jobs/${slug}-${hidden}`)).status(),
			).toBe(404);
		}
		if (testInfo.project.name.startsWith("nextjs")) {
			await page.goto(`/pages/ssg-jobs/${slug}`);
			await expect(
				page.getByRole("heading", { name: title, exact: true }),
			).toBeVisible();
			await expect(page).toHaveTitle(new RegExp(title));
		}

		await page.goto("/pages/jobs");
		await page.waitForLoadState("networkidle");
		await page
			.getByLabel("Department", { exact: true })
			.selectOption(department);
		await expect(
			page.getByRole("link", { name: `onsite ${title}`, exact: true }),
		).toBeVisible();
		await page.getByLabel("Remote roles only", { exact: true }).click();
		await expect(
			page.getByLabel("Remote roles only", { exact: true }),
		).toBeChecked();
		await expect(
			page.getByRole("link", { name: `onsite ${title}`, exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("link", { name: `draft ${title}`, exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("link", { name: `expired ${title}`, exact: true }),
		).toHaveCount(0);
		await page.getByRole("link", { name: title, exact: true }).click();
		await expect(
			page.getByRole("heading", { name: title, exact: true }),
		).toBeVisible();
		await page.getByRole("link", { name: department, exact: true }).click();
		await expect(
			page.getByRole("heading", { name: `${department} roles`, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: title, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: `draft ${title}`, exact: true }),
		).toHaveCount(0);
		await page.getByRole("link", { name: title, exact: true }).click();
		const structuredData = await page
			.locator('script[type="application/ld+json"]')
			.textContent();
		expect(JSON.parse(structuredData ?? "{}")).toMatchObject({
			"@type": "JobPosting",
			title,
			hiringOrganization: { name: "BTST demo team" },
		});
		await page
			.getByRole("link", { name: "Apply for this role", exact: true })
			.click();
		await page
			.getByRole("textbox", { name: "Your name *", exact: true })
			.fill("Job applicant");
		await page
			.getByRole("textbox", { name: "Email *", exact: true })
			.fill("applicant@example.com");
		await page.getByRole("button", { name: "Submit", exact: true }).click();
		await expect(
			page.getByText("Your application has been received.", { exact: true }),
		).toBeVisible();
		const submissions = await request.get(
			`/api/data/forms/${form.id}/submissions?limit=20&offset=0`,
			{
				headers: mockAuthHeaders(),
			},
		);
		expect(submissions.ok()).toBe(true);
		expect((await submissions.json()).items).toHaveLength(1);
	} finally {
		for (const id of jobIds) {
			await request.delete(`/api/data/content/job-posting/${id}`, {
				headers: mockAuthHeaders(),
			});
		}
		await request.delete(`/api/data/forms/${form.id}`, {
			headers: mockAuthHeaders(),
		});
	}
});
