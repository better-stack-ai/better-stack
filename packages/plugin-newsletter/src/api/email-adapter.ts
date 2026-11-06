/** Transport-neutral outgoing email. Custom adapters can wrap an existing SMTP client. */
export interface EmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	from: string;
	replyTo?: string;
	/** Stable per-recipient key. Forward it when your provider supports idempotency. */
	idempotencyKey?: string;
}
/** A definitive rejection: the provider did not accept the message and no request remains in flight. */
export class EmailDeliveryError extends Error {}

/** Provider evidence must describe a terminal attempt; absence from a search is not a definitive failure. */
export type EmailReconciliation =
	| { status: "delivered"; messageId?: string }
	| { status: "failed" }
	| { status: "uncertain" };

/** Bring your own sending infrastructure; no provider SDK is required. */
export interface EmailAdapter {
	send(options: EmailOptions): Promise<{ messageId?: string }>;
	/** Optional receipt lookup. Never return failed while the original request could still be accepted. */
	reconcile?(attempt: {
		idempotencyKey: string;
		messageId?: string;
	}): Promise<EmailReconciliation>;
}

/** Thin wrapper for the Resend HTTP API. */
export function resendAdapter(apiKey: string): EmailAdapter {
	return {
		async send({ replyTo, idempotencyKey, ...options }) {
			const response = await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
				},
				body: JSON.stringify({
					...options,
					...(replyTo ? { reply_to: replyTo } : {}),
				}),
			});
			if (!response.ok)
				throw new Error(`Resend outcome is uncertain (${response.status})`);
			const body = (await response.json()) as { id?: string };
			return { messageId: body.id };
		},
	};
}

/** Thin wrapper for Mailgun; choose the EU API origin for an EU sending domain. */
export function mailgunAdapter(
	apiKey: string,
	domain: string,
	region: "us" | "eu" = "us",
): EmailAdapter {
	if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(domain))
		throw new Error("Invalid Mailgun domain");
	return {
		async send(options) {
			const body = new URLSearchParams({
				from: options.from,
				subject: options.subject,
				html: options.html,
			});
			for (const to of Array.isArray(options.to) ? options.to : [options.to])
				body.append("to", to);
			if (options.replyTo) body.set("h:Reply-To", options.replyTo);
			const origin =
				region === "eu"
					? "https://api.eu.mailgun.net"
					: "https://api.mailgun.net";
			const response = await fetch(
				`${origin}/v3/${encodeURIComponent(domain)}/messages`,
				{
					method: "POST",
					headers: {
						Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
					},
					body,
				},
			);
			if (!response.ok)
				throw new Error(`Mailgun outcome is uncertain (${response.status})`);
			const result = (await response.json()) as { id?: string };
			return { messageId: result.id };
		},
	};
}
