import { describe, expect, it } from "vitest";
import {
	filterCredentialForwardingHeaders,
	resolveTrustedServerOrigin,
} from "../server";

describe("resolveTrustedServerOrigin", () => {
	it("uses the configured origin even when an inbound Host-derived origin differs", () => {
		expect(
			resolveTrustedServerOrigin({
				configuredOrigin: "https://api.example.com/",
				requestOrigin: "https://credentials.example.net",
				isProduction: true,
				label: "BTST_API_URL or BASE_URL",
			}),
		).toBe("https://api.example.com");
	});

	it("fails closed when production has no configured origin", () => {
		expect(() =>
			resolveTrustedServerOrigin({
				requestOrigin: "https://app.example.com",
				isProduction: true,
				label: "BTST_API_URL or BASE_URL",
			}),
		).toThrow("BTST_API_URL or BASE_URL must be configured in production");
	});

	it("allows only loopback request origins without local configuration", () => {
		expect(
			resolveTrustedServerOrigin({
				requestOrigin: "http://127.0.0.1:4173",
				isProduction: false,
			}),
		).toBe("http://127.0.0.1:4173");

		expect(() =>
			resolveTrustedServerOrigin({
				requestOrigin: "https://credentials.example.net",
				isProduction: false,
			}),
		).toThrow("limited to loopback development origins");
	});

	it("rejects configured values that are not origins", () => {
		expect(() =>
			resolveTrustedServerOrigin({
				configuredOrigin: "https://api.example.com/api/data",
				isProduction: true,
				label: "BTST_API_URL",
			}),
		).toThrow("BTST_API_URL must be an absolute HTTP(S) origin");
	});
});

describe("filterCredentialForwardingHeaders", () => {
	it("preserves identity headers but removes routing and hop-by-hop headers", () => {
		const headers = filterCredentialForwardingHeaders({
			authorization: "Bearer secret",
			cookie: "session=secret",
			connection: "keep-alive, x-remove-me",
			forwarded: "host=credentials.example.net",
			host: "credentials.example.net",
			"proxy-connection": "keep-alive",
			"x-forwarded-for": "203.0.113.7",
			"x-forwarded-host": "credentials.example.net",
			"x-forwarded-proto": "https",
			"x-real-ip": "203.0.113.7",
			"x-remove-me": "hop value",
			"x-request-id": "request-id",
		});

		expect(headers.get("authorization")).toBe("Bearer secret");
		expect(headers.get("cookie")).toBe("session=secret");
		expect(headers.get("x-request-id")).toBe("request-id");
		for (const name of [
			"connection",
			"forwarded",
			"host",
			"proxy-connection",
			"x-forwarded-for",
			"x-forwarded-host",
			"x-forwarded-proto",
			"x-real-ip",
			"x-remove-me",
		]) {
			expect(headers.has(name)).toBe(false);
		}
	});
});
