import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanupAbandonedHelpdeskAttachments } from "../api/mutations";
import { helpdeskBackendPlugin } from "../api/plugin";
import { helpdeskPermissions } from "../permissions";
import {
	HELPDESK_ATTACHMENT_MAX_BYTES,
	type HelpdeskAttachmentStorage,
} from "../types";

function setup(enabled = true) {
	let identity = { id: "alice", agent: false };
	let readable = true;
	let adapter!: DBAdapter;
	const objects = new Map<string, Blob>();
	const storage: HelpdeskAttachmentStorage = {
		put: async ({ key, file }) => {
			objects.set(key, file);
		},
		get: async ({ key }) => objects.get(key) ?? null,
		delete: async ({ key }) => {
			objects.delete(key);
		},
	};
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), agent: z.boolean() }),
		permissions: [helpdeskPermissions],
		rules: ({ helpdesk }) => [
			helpdesk.customerTicket.create.when(() => true),
			helpdesk.customerTicket.read.when(() => readable),
			helpdesk.customerTicket.reply.when(() => true),
			helpdesk.ticket.read.when(
				({ identity }) => !!identity?.agent && readable,
			),
			helpdesk.ticket.reply.when(({ identity }) => !!identity?.agent),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({ authorization, getIdentity: () => identity }),
		plugins: {
			helpdesk: helpdeskBackendPlugin(
				enabled ? { attachments: { storage } } : {},
			),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	const request = (
		path: string,
		method = "GET",
		body?: FormData | Record<string, unknown>,
	) =>
		stack.handler(
			new Request(`https://example.test/api/helpdesk${path}`, {
				method,
				headers:
					body && !(body instanceof FormData)
						? { "content-type": "application/json" }
						: undefined,
				body:
					body instanceof FormData
						? body
						: body
							? JSON.stringify(body)
							: undefined,
			}),
		);
	const upload = (
		id: string,
		filename = "screenshot.png",
		internal?: boolean,
	) => {
		const data = new FormData();
		data.set(
			"file",
			new File(["private bytes"], filename, { type: "image/png" }),
		);
		if (internal !== undefined) data.set("isInternalNote", String(internal));
		return request(
			`/${identity.agent ? "inbox" : "tickets"}/${id}/attachments`,
			"POST",
			data,
		);
	};
	const create = (customerId = "alice") =>
		stack.trusted.helpdesk.createTicket({
			subject: "Support",
			body: "Need help",
			customerId,
		});
	return {
		stack,
		request,
		upload,
		create,
		objects,
		storage,
		adapter: () => adapter,
		as: (id: string, agent = false) => {
			identity = { id, agent };
		},
		denyRead: () => {
			readable = false;
		},
	};
}

afterEach(() => vi.useRealTimers());
describe("protected Helpdesk attachments", () => {
	it("works without Media and serves only current authorized message attachments", async () => {
		const s = setup();
		const ticket = await s.create();
		const uploaded = await s.upload(ticket.id);
		expect(uploaded.status).toBe(200);
		const file = await uploaded.json();
		expect(file).toEqual({
			id: expect.any(String),
			filename: "screenshot.png",
			mimeType: "image/png",
			size: 13,
		});
		const path = `/tickets/${ticket.id}/attachments/${file.id}`;
		expect((await s.request(path)).status).toBe(404);
		const reply = await s.request(`/tickets/${ticket.id}/replies`, "POST", {
			body: "Screenshot",
			attachmentIds: [file.id],
		});
		expect(reply.status).toBe(200);
		expect((await reply.json()).messages.at(-1).attachments).toEqual([file]);
		const download = await s.request(path);
		expect(download.status).toBe(200);
		expect(await download.text()).toBe("private bytes");
		expect(download.headers.get("cache-control")).toBe("private, no-store");
		expect(download.headers.get("content-disposition")).toContain(
			"attachment;",
		);
		expect(download.headers.get("x-content-type-options")).toBe("nosniff");
		s.as("bob");
		expect((await s.request(path)).status).toBe(404);
		s.as("alice");
		s.denyRead();
		expect((await s.request(path)).status).toBe(403);
		expect((await s.upload(ticket.id)).status).toBe(403);
	});

	it("rejects forged, cross-ticket, cross-owner and reused references atomically", async () => {
		const s = setup();
		const alice = await s.create();
		const other = await s.create();
		const bob = await s.create("bob");
		const file = await (await s.upload(alice.id)).json();
		s.as("bob");
		expect(
			(
				await s.request(`/tickets/${bob.id}/replies`, "POST", {
					body: "Theft",
					attachmentIds: [file.id],
				})
			).status,
		).toBe(400);
		s.as("alice");
		for (const [id, ids] of [
			[other.id, [file.id]],
			[alice.id, ["forged-media-id"]],
			[alice.id, [file.id, file.id]],
		] as const)
			expect(
				(
					await s.request(`/tickets/${id}/replies`, "POST", {
						body: "Invalid",
						attachmentIds: ids,
					})
				).status,
			).toBe(400);
		expect(
			(
				await s.request(`/tickets/${alice.id}/replies`, "POST", {
					body: "URL",
					attachmentIds: [],
					url: "https://evil.test",
				})
			).status,
		).toBe(400);
		expect((await s.request(`/tickets/${alice.id}`)).status).toBe(200);
		expect(
			(await (await s.request(`/tickets/${alice.id}`)).json()).messages,
		).toHaveLength(1);
		expect(
			(
				await s.request(`/tickets/${alice.id}/replies`, "POST", {
					body: "Valid",
					attachmentIds: [file.id],
				})
			).status,
		).toBe(200);
		expect(
			(
				await s.request(`/tickets/${alice.id}/replies`, "POST", {
					body: "Reuse",
					attachmentIds: [file.id],
				})
			).status,
		).toBe(400);
		expect(
			(await s.request(`/tickets/${alice.id}/attachments/${file.id}`, "DELETE"))
				.status,
		).toBe(404);
	});

	it("excludes internal filenames, counts, ids and links from all customer messages", async () => {
		const s = setup();
		const ticket = await s.create();
		s.as("agent", true);
		const file = await (
			await s.upload(ticket.id, "private-investigation.png", true)
		).json();
		expect(
			(
				await s.request(`/inbox/${ticket.id}/replies`, "POST", {
					body: "Wrong audience",
					attachmentIds: [file.id],
				})
			).status,
		).toBe(400);
		expect(
			(
				await s.request(`/inbox/${ticket.id}/replies`, "POST", {
					body: "Internal",
					isInternalNote: true,
					attachmentIds: [file.id],
				})
			).status,
		).toBe(200);
		expect(
			(await s.request(`/inbox/${ticket.id}/attachments/${file.id}`)).status,
		).toBe(200);
		s.as("alice");
		const customer = await (await s.request(`/tickets/${ticket.id}`)).json();
		expect(customer.messages).toHaveLength(1);
		expect(JSON.stringify(customer)).not.toContain("private-investigation");
		expect(JSON.stringify(customer)).not.toContain(file.id);
		expect(
			(await s.request(`/tickets/${ticket.id}/attachments/${file.id}`)).status,
		).toBe(404);
		expect((await s.upload(ticket.id, "invalid.png", true)).status).toBe(400);
	});

	it("validates size, MIME, filename, count and disabled storage at the boundary", async () => {
		const s = setup();
		const ticket = await s.create();
		for (const file of [
			new File(["x"], "bad.html", { type: "text/html" }),
			new File(["x"], "a\nb.png", { type: "image/png" }),
			new File([new Uint8Array(HELPDESK_ATTACHMENT_MAX_BYTES + 1)], "big.png", {
				type: "image/png",
			}),
		]) {
			const data = new FormData();
			data.set("file", file);
			expect(
				(await s.request(`/tickets/${ticket.id}/attachments`, "POST", data))
					.status,
			).toBeGreaterThanOrEqual(400);
		}
		expect(s.objects.size).toBe(0);
		const maximum = new FormData();
		maximum.set(
			"file",
			new File([new Uint8Array(HELPDESK_ATTACHMENT_MAX_BYTES)], "maximum.png", {
				type: "image/png",
			}),
		);
		const accepted = await s.request(
			`/tickets/${ticket.id}/attachments`,
			"POST",
			maximum,
		);
		expect(accepted.status).toBe(200);
		expect((await accepted.json()).size).toBe(10_485_760);
		expect(
			(
				await s.request(`/tickets/${ticket.id}/replies`, "POST", {
					body: "Too many",
					attachmentIds: ["1", "2", "3", "4", "5", "6"],
				})
			).status,
		).toBe(400);
		const disabled = setup(false);
		const own = await disabled.create();
		expect((await disabled.upload(own.id)).status).toBe(503);
		await expect(
			s.stack.trusted.helpdesk.uploadCustomerAttachment({
				id: ticket.id,
				customerId: "alice",
				filename: "a.png",
				mimeType: "image/png",
				contentBase64: "eB==",
			}),
		).rejects.toThrow("Invalid attachment contents");
	});

	it("keeps failed storage writes discoverable for idempotent cleanup", async () => {
		vi.useFakeTimers();
		const s = setup();
		const ticket = await s.create();
		s.storage.put = async ({ key, file }) => {
			s.objects.set(key, file);
			throw new Error("Storage connection interrupted");
		};
		await expect(
			s.stack.trusted.helpdesk.uploadCustomerAttachment({
				id: ticket.id,
				customerId: "alice",
				filename: "a.png",
				mimeType: "image/png",
				contentBase64: "eA==",
			}),
		).rejects.toThrow("Storage connection interrupted");
		expect(s.objects.size).toBe(1);
		vi.advanceTimersByTime(86_400_001);
		expect(
			await cleanupAbandonedHelpdeskAttachments(s.adapter(), s.storage),
		).toBe(1);
		expect(s.objects.size).toBe(0);
		expect(
			await cleanupAbandonedHelpdeskAttachments(s.adapter(), s.storage),
		).toBe(0);
	});

	it("removes abandoned uploads but retains submitted files and rejects expired refs", async () => {
		vi.useFakeTimers();
		const s = setup();
		const ticket = await s.create();
		const abandoned = await (await s.upload(ticket.id)).json();
		const retained = await (await s.upload(ticket.id)).json();
		await s.request(`/tickets/${ticket.id}/replies`, "POST", {
			body: "Keep",
			attachmentIds: [retained.id],
		});
		vi.advanceTimersByTime(86_400_001);
		expect(
			(
				await s.request(`/tickets/${ticket.id}/replies`, "POST", {
					body: "Expired",
					attachmentIds: [abandoned.id],
				})
			).status,
		).toBe(400);
		expect(
			await cleanupAbandonedHelpdeskAttachments(s.adapter(), s.storage),
		).toBe(1);
		expect(s.objects.size).toBe(1);
		expect(
			(await s.request(`/tickets/${ticket.id}/attachments/${retained.id}`))
				.status,
		).toBe(200);
		const pending = await (await s.upload(ticket.id)).json();
		expect(
			(
				await s.request(
					`/tickets/${ticket.id}/attachments/${pending.id}`,
					"DELETE",
				)
			).status,
		).toBe(200);
		expect(s.objects.size).toBe(1);
	});
});
