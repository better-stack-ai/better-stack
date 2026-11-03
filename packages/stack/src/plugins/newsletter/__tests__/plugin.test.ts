import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { createBackendStack } from "../../../api";
import { z } from "zod";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { newsletterPermissions } from "../permissions";
import {
	newsletterBackendPlugin,
	type NewsletterBackendOptions,
} from "../api/plugin";
import type { EmailOptions } from "../api/email-adapter";
import { claimCampaign } from "../api/mutations";
import { parseSubscriberCsv, exportSubscriberCsv } from "../api/csv";

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [newsletterPermissions],
	rules: () => [],
});

const base = "https://example.test/api/newsletter";
const draft = {
	subject: "Field notes",
	fromName: "The editor",
	fromEmail: "editor@example.test",
	body: "# A new edition\n\n[Read the article](https://example.test/post?one=1&two=2)",
	tags: ["readers"],
};
function setup(overrides: Partial<NewsletterBackendOptions> = {}) {
	const emails: EmailOptions[] = [];
	let adapter!: DBAdapter;
	const send = vi.fn(async (email: EmailOptions) => {
		emails.push(email);
		return { messageId: `message-${emails.length}` };
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({ authorization, getIdentity: () => null }),
		plugins: {
			newsletter: newsletterBackendPlugin({
				emailAdapter: { send },
				unsubscribeBaseURL: base,
				...overrides,
			}),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return {
		stack,
		adapter: () => adapter,
		emails,
		send,
		operations: stack.trusted.newsletter,
	};
}
function tokenFrom(html: string, route: string): string {
	const match = html.match(new RegExp(`${route}\\?token=([a-f0-9]{64})`));
	if (!match?.[1]) throw new Error(`Missing ${route} token`);
	return match[1];
}
function publicRequest(path: string, method = "GET", body?: unknown) {
	return new Request(`https://example.test/api/newsletter/${path}`, {
		method,
		...(body
			? {
					body: JSON.stringify(body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});
}

describe("newsletter operation flows", () => {
	it("requires management authorization while allowing the public form without admin token disclosure", async () => {
		const { stack, operations } = setup();
		expect((await stack.handler(publicRequest("subscribers"))).status).toBe(
			401,
		);
		const response = await stack.handler(
			publicRequest("subscribe", "POST", {
				email: "reader@example.test",
				tags: ["readers"],
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: expect.any(String),
		});
		await Promise.all([
			operations.subscribe({ email: "reader@example.test", tags: ["other"] }),
			operations.subscribe({
				email: "reader@example.test",
				tags: ["injected"],
			}),
		]);
		const result = await operations.listSubscribers({});
		expect(result.total).toBe(1);
		expect(result.items[0]).toMatchObject({
			email: "reader@example.test",
			status: "subscribed",
			tags: ["readers"],
		});
		expect(JSON.stringify(result)).not.toMatch(/Token|token/);
	});

	it("sends one targeted copy under concurrent sends and keeps old unsubscribe links valid", async () => {
		const { operations, emails, stack, send } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		await operations.createSubscriber({
			email: "other@example.test",
			tags: ["other"],
		});
		await operations.createSubscriber({
			email: "optout@example.test",
			tags: ["readers"],
			status: "unsubscribed",
		});
		const first = await operations.createCampaign(draft);
		const results = await Promise.allSettled([
			operations.sendCampaign({ id: first.id }),
			operations.sendCampaign({ id: first.id }),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(send).toHaveBeenCalledTimes(1);
		expect(emails[0]).toMatchObject({
			to: "reader@example.test",
			idempotencyKey: expect.any(String),
		});
		expect(emails[0]?.html).toContain("<h1>A new edition</h1>");
		const oldUnsubscribe = tokenFrom(emails[0]?.html ?? "", "unsubscribe");
		const second = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: second.id });
		expect(send).toHaveBeenCalledTimes(2);
		const response = await stack.handler(
			publicRequest(`unsubscribe?token=${oldUnsubscribe}`),
		);
		expect(response.status).toBe(200);
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0]?.status,
		).toBe("unsubscribed");
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["other"],
			name: "Injected",
		});
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0],
		).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
		await expect(
			operations.sendCampaign({ id: first.id }),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it("tracks unique opens and clicks, and redirects only to stored links", async () => {
		const { operations, emails, stack } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: campaign.id });
		const token = tokenFrom(emails[0]?.html ?? "", "track/open");
		for (let i = 0; i < 2; i++)
			expect(
				(
					await stack.handler(publicRequest(`track/open?token=${token}`))
				).headers.get("content-type"),
			).toBe("image/gif");
		const clicked = await stack.handler(
			publicRequest(`track/click?token=${token}&link=0&url=https://evil.test`),
		);
		expect(clicked.status).toBe(302);
		expect(clicked.headers.get("location")).toBe(
			"https://example.test/post?one=1&two=2",
		);
		expect(
			(await stack.handler(publicRequest(`track/click?token=${token}&link=1`)))
				.status,
		).toBe(404);
		expect(
			await operations.getCampaignStats({ id: campaign.id }),
		).toMatchObject({
			delivered: 1,
			opened: 1,
			clicked: 1,
			openRate: 1,
			clickRate: 1,
		});
		expect(
			(
				await stack.handler(
					publicRequest(`unsubscribe?token=${"0".repeat(64)}`),
				)
			).status,
		).toBe(404);
	});

	it("confirms opt-in once, rejects expired links, and retries failed confirmation without altering subscriber tags", async () => {
		let failFirst = true;
		const confirmations: string[] = [];
		const { operations, adapter } = setup({
			doubleOptIn: true,
			hooks: {
				onConfirmationRequired: async ({ url }) => {
					if (failFirst) {
						failFirst = false;
						throw new Error("temporary transport failure");
					}
					confirmations.push(url);
				},
			},
		});
		await expect(
			operations.subscribe({ email: "reader@example.test", tags: ["readers"] }),
		).rejects.toThrow("temporary transport failure");
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["injected"],
			name: "Injected",
		});
		expect(confirmations).toHaveLength(1);
		let reader = (await operations.listSubscribers({})).items[0];
		expect(reader).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
		const token = new URL(confirmations[0]!).searchParams.get("token")!;
		await operations.confirmSubscription({ token });
		await expect(
			operations.confirmSubscription({ token }),
		).rejects.toMatchObject({ statusCode: 400 });
		await operations.updateSubscriber({
			id: reader!.id,
			data: { status: "unsubscribed" },
		});
		await adapter().update({
			model: "newsletterSubscriber",
			where: [{ field: "id", value: reader!.id, operator: "eq" }],
			update: { confirmationSentAt: new Date(0) },
		});
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["injected"],
		});
		expect(confirmations).toHaveLength(2);
		const expired = new URL(confirmations[1]!).searchParams.get("token")!;
		await adapter().update({
			model: "newsletterSubscriber",
			where: [{ field: "id", value: reader!.id, operator: "eq" }],
			update: { confirmationExpiresAt: new Date(0) },
		});
		await expect(
			operations.confirmSubscription({ token: expired }),
		).rejects.toMatchObject({ statusCode: 400 });
		reader = (await operations.listSubscribers({})).items[0];
		expect(reader).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
	});

	it("does not claim a campaign rescheduled after a scheduler snapshot", async () => {
		const { operations, adapter, send } = setup();
		const campaign = await operations.createCampaign(draft);
		await operations.scheduleCampaign({
			id: campaign.id,
			scheduledAt: new Date(Date.now() + 60_000).toISOString(),
		});
		expect(
			await claimCampaign(adapter(), campaign.id, "scheduled", new Date()),
		).toBeNull();
		expect(await operations.sendScheduledCampaigns({})).toEqual({ sent: 0 });
		await adapter().update({
			model: "newsletterCampaign",
			where: [{ field: "id", value: campaign.id, operator: "eq" }],
			update: { scheduledAt: new Date(Date.now() - 1000) },
		});
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		expect(await operations.sendScheduledCampaigns({})).toEqual({ sent: 1 });
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("rejects malformed CSV before writes and preserves imported opt-outs", async () => {
		const { operations } = setup();
		await expect(
			operations.importSubscribers({
				csv: 'email,tags\nvalid@example.test,[]\nother@example.test,"[bad"',
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((await operations.listSubscribers({})).total).toBe(0);
		await expect(
			operations.importSubscribers({
				csv: "email\nvalid@example.test\ninvalid",
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((await operations.listSubscribers({})).total).toBe(0);
		await operations.createSubscriber({
			email: "reader@example.test",
			status: "unsubscribed",
			tags: ["original"],
		});
		await operations.importSubscribers({
			csv: 'email,name,status,tags\nreader@example.test,New,subscribed,[]\nnew@example.test,"Reader, two",subscribed,"[""readers""]"',
		});
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0],
		).toMatchObject({ status: "unsubscribed", tags: ["original"] });
		expect((await operations.listSubscribers({})).total).toBe(2);
		const exported = await operations.exportSubscribers({});
		expect(parseSubscriberCsv(exported.csv)).toHaveLength(2);
	});

	it("renders provider failures as failed receipts and never automatically sends them again", async () => {
		const { operations, send } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		send.mockRejectedValueOnce(new Error("provider unavailable"));
		await operations.sendCampaign({ id: campaign.id });
		expect(
			await operations.getCampaignStats({ id: campaign.id }),
		).toMatchObject({ delivered: 0, failed: 1, recipientCount: 1 });
		await expect(
			operations.sendCampaign({ id: campaign.id }),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("partial edits preserve omitted tags, consent status and HTML format while allowing reply-to to clear", async () => {
		const { operations } = setup();
		const reader = await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
			status: "unsubscribed",
		});
		expect(
			await operations.updateSubscriber({
				id: reader.id,
				data: { name: "Updated" },
			}),
		).toMatchObject({
			status: "unsubscribed",
			tags: ["readers"],
			name: "Updated",
		});
		const campaign = await operations.createCampaign({
			...draft,
			format: "html",
			body: "<p>Original</p>",
			replyTo: "reply@example.test",
		});
		expect(
			await operations.updateCampaign({
				id: campaign.id,
				data: { subject: "Updated", replyTo: null },
			}),
		).toMatchObject({
			subject: "Updated",
			tags: ["readers"],
			format: "html",
			replyTo: null,
		});
	});

	it("email changes revoke old confirmation and unsubscribe links and require fresh consent", async () => {
		const confirmations: string[] = [];
		const { operations, emails, stack } = setup({
			doubleOptIn: true,
			hooks: {
				onConfirmationRequired: ({ url }) => {
					confirmations.push(url);
				},
			},
		});
		const subscriber = await operations.createSubscriber({
			email: "old@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: campaign.id });
		const unsubscribe = tokenFrom(emails[0]!.html, "unsubscribe");
		expect(
			await operations.updateSubscriber({
				id: subscriber.id,
				data: { email: "new@example.test" },
			}),
		).toMatchObject({
			email: "new@example.test",
			status: "unsubscribed",
			confirmedAt: null,
		});
		expect(
			(await stack.handler(publicRequest(`unsubscribe?token=${unsubscribe}`)))
				.status,
		).toBe(404);
		const second = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: second.id });
		expect(emails).toHaveLength(1);
		await operations.subscribe({ email: "new@example.test" });
		await operations.confirmSubscription({
			token: new URL(confirmations[0]!).searchParams.get("token")!,
		});
		expect((await operations.getSubscriber({ id: subscriber.id })).status).toBe(
			"subscribed",
		);
	});

	it("binds unsubscribe receipts to the outgoing address when the subscriber changes before receipt creation", async () => {
		const { operations, emails, stack, adapter } = setup();
		const subscriber = await operations.createSubscriber({
			email: "original@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		const db = adapter();
		const findOne = db.findOne.bind(db);
		let changed = false;
		db.findOne = async <T>(
			options: Parameters<DBAdapter["findOne"]>[0],
		): Promise<T | null> => {
			const snapshot = await findOne<T>(options);
			if (!changed && options.model === "newsletterSubscriber" && snapshot) {
				changed = true;
				await db.update({
					model: "newsletterSubscriber",
					where: [{ field: "id", value: subscriber.id, operator: "eq" }],
					update: { email: "replacement@example.test" },
				});
			}
			return snapshot;
		};
		try {
			await operations.sendCampaign({ id: campaign.id });
		} finally {
			db.findOne = findOne;
		}
		expect(changed).toBe(true);
		expect(emails[0]?.to).toBe("original@example.test");
		const receipt = await db.findOne<{ email: string }>({
			model: "newsletterSend",
			where: [{ field: "campaignId", value: campaign.id, operator: "eq" }],
		});
		expect(receipt?.email).toBe("original@example.test");
		const token = tokenFrom(emails[0]!.html, "unsubscribe");
		expect(
			(await stack.handler(publicRequest(`unsubscribe?token=${token}`))).status,
		).toBe(404);
		expect(await operations.getSubscriber({ id: subscriber.id })).toMatchObject(
			{ email: "replacement@example.test", status: "subscribed" },
		);
	});

	it.each(["transactional", "test"] as const)(
		"allows a %s-only recipient to opt in once while preserving explicit opt-outs",
		async (kind) => {
			const { operations, emails } = setup();
			const campaign =
				kind === "test" ? await operations.createCampaign(draft) : null;
			async function sendTo(email: string) {
				if (campaign)
					await operations.sendTestEmail({ id: campaign.id, email });
				else
					await operations.sendTransactionalEmail({
						to: email,
						from: "editor@example.test",
						subject: "Your receipt",
						html: "<p>Receipt</p>",
					});
				return tokenFrom(emails.at(-1)!.html, "unsubscribe");
			}
			const token = await sendTo("reader@example.test");
			await operations.subscribe({
				email: "reader@example.test",
				name: "Reader",
				tags: ["readers"],
			});
			const reader = (await operations.listSubscribers({ query: "reader@" }))
				.items[0]!;
			expect(reader).toMatchObject({
				name: "Reader",
				tags: ["readers"],
				status: "subscribed",
				confirmedAt: expect.any(String),
			});
			expect(reader).not.toHaveProperty("transactionOnly");
			const newsletter = await operations.createCampaign(draft);
			await operations.sendCampaign({ id: newsletter.id });
			expect(emails.at(-1)?.to).toBe("reader@example.test");
			await operations.unsubscribe({ token });
			await operations.subscribe({
				email: "reader@example.test",
				tags: ["injected"],
			});
			expect(await operations.getSubscriber({ id: reader.id })).toMatchObject({
				status: "unsubscribed",
				tags: ["readers"],
			});

			const beforeOptInToken = await sendTo("optout@example.test");
			await operations.unsubscribe({ token: beforeOptInToken });
			await operations.subscribe({
				email: "optout@example.test",
				tags: ["readers"],
			});
			expect(
				(await operations.listSubscribers({ query: "optout@" })).items[0]
					?.status,
			).toBe("unsubscribed");

			await sendTo("admin-optout@example.test");
			const adminOptOut = (
				await operations.listSubscribers({ query: "admin-optout@" })
			).items[0]!;
			await operations.updateSubscriber({
				id: adminOptOut.id,
				data: { status: "unsubscribed" },
			});
			await operations.subscribe({ email: "admin-optout@example.test" });
			expect(
				(await operations.getSubscriber({ id: adminOptOut.id })).status,
			).toBe("unsubscribed");
		},
	);

	it("requires double opt-in when a transactional-only address first joins the newsletter", async () => {
		const confirmations: string[] = [];
		const { operations } = setup({
			doubleOptIn: true,
			hooks: {
				onConfirmationRequired: ({ url }) => {
					confirmations.push(url);
				},
			},
		});
		await operations.sendTransactionalEmail({
			to: "reader@example.test",
			from: "editor@example.test",
			subject: "Your receipt",
			html: "<p>Receipt</p>",
		});
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["readers"],
		});
		expect((await operations.listSubscribers({})).items[0]).toMatchObject({
			status: "unsubscribed",
			tags: ["readers"],
			confirmedAt: null,
		});
		expect(confirmations).toHaveLength(1);
		await operations.confirmSubscription({
			token: new URL(confirmations[0]!).searchParams.get("token")!,
		});
		expect((await operations.listSubscribers({})).items[0]).toMatchObject({
			status: "subscribed",
			tags: ["readers"],
		});
	});

	it("exports formula-safe names and keeps CSV multiline values", () => {
		const csv = exportSubscriberCsv([
			{
				id: "one",
				email: "reader@example.test",
				name: "=HYPERLINK(1)",
				status: "subscribed",
				tags: [],
				createdAt: new Date().toISOString(),
			},
		]);
		expect(parseSubscriberCsv(csv)[0]?.name).toBe("'=HYPERLINK(1)");
		expect(
			parseSubscriberCsv('email,name\r\nreader@example.test,"First\nSecond"')[0]
				?.name,
		).toBe("First\nSecond");
	});
});
