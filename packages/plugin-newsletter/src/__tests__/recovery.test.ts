import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { newsletterPermissions } from "../permissions";
import { newsletterBackendPlugin } from "../api/plugin";
import {
	EmailDeliveryError,
	type EmailAdapter,
	type EmailOptions,
} from "../api/email-adapter";
import type { CampaignRecord, SendRecord } from "../types";

const draft = {
	subject: "Recovery",
	fromName: "Editor",
	fromEmail: "editor@example.test",
	body: "[Read](https://example.test/post)",
	tags: ["readers"],
};
function setup(
	emailAdapter: EmailAdapter = {
		send: vi.fn(async () => ({ messageId: "accepted" })),
	},
	readOnly = false,
) {
	let adapter!: DBAdapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [newsletterPermissions],
		rules: ({ newsletter }) =>
			readOnly ? [newsletter.campaign.read.allow()] : [],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({
			authorization,
			getIdentity: () => (readOnly ? { id: "reader" } : null),
		}),
		plugins: {
			newsletter: newsletterBackendPlugin({
				emailAdapter,
				unsubscribeBaseURL: "https://example.test/api/newsletter",
			}),
		},
		adapter: (db) => (adapter = createMemoryAdapter(db)({})),
	});
	const operations = stack.trusted.newsletter;
	return { stack, operations, adapter: () => adapter, send: emailAdapter.send };
}
async function seed(
	operations: ReturnType<typeof setup>["operations"],
	count = 1,
) {
	const subscribers = [];
	for (let i = 0; i < count; i++)
		subscribers.push(
			await operations.createSubscriber({
				email: `reader${i}@example.test`,
				tags: ["readers"],
			}),
		);
	return { campaign: await operations.createCampaign(draft), subscribers };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("newsletter campaign recovery", () => {
	it("keeps provider ambiguity uncertain until explicit resolution and preserves the exact retry payload", async () => {
		const send = vi
			.fn<(options: EmailOptions) => Promise<{ messageId?: string }>>()
			.mockRejectedValueOnce(new Error("response lost with secret token"))
			.mockResolvedValue({ messageId: "accepted" });
		const { operations } = setup({ send });
		const { campaign } = await seed(operations);
		expect((await operations.sendCampaign({ id: campaign.id })).status).toBe(
			"sending",
		);
		const recovery = await operations.getCampaignRecovery({ id: campaign.id });
		expect(recovery.counts.uncertain).toBe(1);
		expect(JSON.stringify(recovery)).not.toMatch(
			/trackingToken|unsubscribeToken|attemptId|html|secret token/,
		);
		await operations.resumeCampaign({ id: campaign.id });
		expect(send).toHaveBeenCalledTimes(1);
		await operations.resolveCampaignRecipient({
			id: campaign.id,
			sendId: recovery.items[0]!.id,
			resolution: "failed",
		});
		expect((await operations.resumeCampaign({ id: campaign.id })).status).toBe(
			"sent",
		);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
	});

	it("resumes a crash before receipt creation using the frozen audience, excluding new subscribers", async () => {
		const fixture = setup();
		const { campaign, subscribers } = await seed(fixture.operations);
		await fixture.adapter().update({
			model: "newsletterCampaign",
			where: [{ field: "id", value: campaign.id, operator: "eq" }],
			update: {
				status: "sending",
				audience: JSON.stringify(
					subscribers.map(({ id, email }) => ({ id, email })),
				),
			},
		});
		await fixture.operations.createSubscriber({
			email: "late@example.test",
			tags: ["readers"],
		});
		await Promise.all([
			fixture.operations.resumeCampaign({ id: campaign.id }),
			fixture.operations.resumeCampaign({ id: campaign.id }),
		]);
		expect(fixture.send).toHaveBeenCalledTimes(1);
		expect(
			(await fixture.operations.getCampaignRecovery({ id: campaign.id }))
				.counts,
		).toMatchObject({ delivered: 1, pending: 0 });
	});

	it("does not steal an active request and fences late completion after an explicit skip", async () => {
		const accepted = deferred<{ messageId: string }>();
		const entered = deferred<void>();
		const send = vi.fn(async () => {
			entered.resolve();
			return accepted.promise;
		});
		const { operations } = setup({ send });
		const { campaign } = await seed(operations);
		const worker = operations.sendCampaign({ id: campaign.id });
		await entered.promise;
		const recovery = await operations.getCampaignRecovery({ id: campaign.id });
		expect(recovery.counts.dispatching).toBe(1);
		await expect(
			operations.resolveCampaignRecipient({
				id: campaign.id,
				sendId: recovery.items[0]!.id,
				resolution: "failed",
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		await Promise.all([
			operations.resumeCampaign({ id: campaign.id }),
			operations.resumeCampaign({ id: campaign.id }),
		]);
		expect(send).toHaveBeenCalledTimes(1);
		await operations.resolveCampaignRecipient({
			id: campaign.id,
			sendId: recovery.items[0]!.id,
			resolution: "skipped",
		});
		accepted.resolve({ messageId: "late" });
		await worker;
		expect(
			(await operations.getCampaignRecovery({ id: campaign.id })).counts,
		).toMatchObject({ skipped: 1, delivered: 0 });
	});

	it("reconciles provider acceptance after an interrupted receipt write without another send", async () => {
		const reconcile = vi.fn(async () => ({
			status: "delivered" as const,
			messageId: "provider-receipt",
		}));
		const fixture = setup({
			send: vi.fn(async () => ({ messageId: "provider-receipt" })),
			reconcile,
		});
		const { campaign } = await seed(fixture.operations);
		const increment = fixture.adapter().incrementOne.bind(fixture.adapter());
		vi.spyOn(fixture.adapter(), "incrementOne").mockImplementation(
			async (input) => {
				if (
					input.model === "newsletterSend" &&
					input.set?.status === "delivered"
				)
					throw new Error("process interrupted after acceptance");
				return increment(input);
			},
		);
		await expect(
			fixture.operations.sendCampaign({ id: campaign.id }),
		).rejects.toThrow("interrupted");
		vi.restoreAllMocks();
		await fixture.operations.resumeCampaign({ id: campaign.id });
		expect(fixture.send).toHaveBeenCalledTimes(1);
		const recovered = await fixture.operations.reconcileCampaign({
			id: campaign.id,
		});
		expect(recovered.counts.delivered).toBe(1);
		expect(reconcile).toHaveBeenCalledWith({
			idempotencyKey: expect.any(String),
			messageId: undefined,
		});
		expect(
			(await fixture.operations.getCampaign({ id: campaign.id })).status,
		).toBe("sent");
	});

	it("rechecks opt-out and original address before retrying definitive failures", async () => {
		const send = vi.fn().mockRejectedValue(new EmailDeliveryError("rejected"));
		const { operations } = setup({ send });
		const { campaign, subscribers } = await seed(operations, 2);
		await operations.sendCampaign({ id: campaign.id });
		await operations.updateSubscriber({
			id: subscribers[0]!.id,
			data: { status: "unsubscribed" },
		});
		await operations.updateSubscriber({
			id: subscribers[1]!.id,
			data: { email: "replacement@example.test", status: "subscribed" },
		});
		await operations.resumeCampaign({ id: campaign.id });
		expect(send).toHaveBeenCalledTimes(2);
		expect(
			(await operations.getCampaignRecovery({ id: campaign.id })).counts
				.skipped,
		).toBe(2);
	});

	it("concurrent resumes retry each definitive failure once and skip accepted receipts", async () => {
		const send = vi
			.fn()
			.mockResolvedValueOnce({ messageId: "first" })
			.mockRejectedValueOnce(new EmailDeliveryError("rejected"))
			.mockResolvedValue({ messageId: "retry" });
		const { operations } = setup({ send });
		const { campaign } = await seed(operations, 2);
		await operations.sendCampaign({ id: campaign.id });
		await Promise.all([
			operations.resumeCampaign({ id: campaign.id }),
			operations.resumeCampaign({ id: campaign.id }),
		]);
		expect(send).toHaveBeenCalledTimes(3);
		expect(
			await operations.getCampaignStats({ id: campaign.id }),
		).toMatchObject({ delivered: 2, failed: 0, recipientCount: 2 });
	});

	it("blocks legacy audience reconstruction and treats old failed outcomes as unknown", async () => {
		const fixture = setup();
		const { campaign, subscribers } = await seed(fixture.operations);
		await fixture.adapter().update<CampaignRecord>({
			model: "newsletterCampaign",
			where: [{ field: "id", value: campaign.id, operator: "eq" }],
			update: { status: "sending" },
		});
		await fixture.adapter().create<SendRecord>({
			model: "newsletterSend",
			data: {
				key: `${campaign.id}:${subscribers[0]!.id}`,
				campaignId: campaign.id,
				subscriberId: subscribers[0]!.id,
				email: subscribers[0]!.email,
				status: "failed",
				trackingToken: "legacy-tracking",
				unsubscribeToken: "legacy-unsubscribe",
				links: "[]",
			},
		});
		const recovery = await fixture.operations.getCampaignRecovery({
			id: campaign.id,
		});
		expect(recovery).toMatchObject({
			audienceReady: false,
			counts: { dispatching: 1 },
		});
		expect(recovery.items[0]!.canRetry).toBe(false);
		await expect(
			fixture.operations.resumeCampaign({ id: campaign.id }),
		).rejects.toMatchObject({ code: "RECOVERY_AUDIENCE_UNAVAILABLE" });
		await expect(
			fixture.operations.resolveCampaignRecipient({
				id: campaign.id,
				sendId: recovery.items[0]!.id,
				resolution: "failed",
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(fixture.send).not.toHaveBeenCalled();
	});

	it("does not expose recipient addresses to campaign-read-only actors", async () => {
		const { stack, operations } = setup(undefined, true);
		const { campaign } = await seed(operations);
		const read = await stack.handler(
			new Request(
				`https://example.test/api/newsletter/campaigns/${campaign.id}`,
			),
		);
		expect(read.status).toBe(200);
		const recovery = await stack.handler(
			new Request(
				`https://example.test/api/newsletter/campaigns/${campaign.id}/recovery`,
			),
		);
		expect(recovery.status).toBe(403);
	});

	it("does not release a dispatch claim on provider failure evidence before transport has started", async () => {
		const blocked = deferred<void>();
		const entered = deferred<void>();
		const fixture = setup({
			send: vi.fn(async () => ({ messageId: "accepted" })),
			reconcile: async () => ({ status: "failed" }),
		});
		const { campaign } = await seed(fixture.operations);
		const find = fixture.adapter().findOne.bind(fixture.adapter());
		const spy = vi
			.spyOn(fixture.adapter(), "findOne")
			.mockImplementation(async (input) => {
				if (input.model === "newsletterSubscriber") {
					entered.resolve();
					await blocked.promise;
				}
				return find(input);
			});
		const worker = fixture.operations.sendCampaign({ id: campaign.id });
		await entered.promise;
		await fixture.operations.reconcileCampaign({ id: campaign.id });
		expect(
			(await fixture.operations.getCampaignRecovery({ id: campaign.id })).counts
				.dispatching,
		).toBe(1);
		await fixture.operations.resumeCampaign({ id: campaign.id });
		expect(fixture.send).not.toHaveBeenCalled();
		blocked.resolve();
		await worker;
		spy.mockRestore();
		expect(fixture.send).toHaveBeenCalledTimes(1);
	});

	it("requires management authorization for inspection, reconciliation, resolution and resume", async () => {
		const { stack, operations } = setup();
		const { campaign } = await seed(operations);
		for (const [path, method, body] of [
			["recovery", "GET", undefined],
			["resume", "POST", undefined],
			["reconcile", "POST", undefined],
			["recipients/unknown/resolve", "POST", { resolution: "failed" }],
		] as const) {
			const response = await stack.handler(
				new Request(
					`https://example.test/api/newsletter/campaigns/${campaign.id}/${path}`,
					{
						method,
						...(body
							? {
									body: JSON.stringify(body),
									headers: { "content-type": "application/json" },
								}
							: {}),
					},
				),
			);
			expect(response.status).toBe(401);
		}
	});
});
