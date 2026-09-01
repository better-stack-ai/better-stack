import type { BrowserContext } from "@playwright/test";

/** Headers for direct requests to the generated apps' request-aware backend. */
export function mockAuthHeaders(userId = "admin-e2e") {
	return {
		cookie: `btst.example_session=mock-session-${userId}`,
	};
}

/** Install the generated apps' mock request session for browser smoke tests. */
export async function setMockAuthCookie(
	context: BrowserContext,
	userId = "admin-e2e",
) {
	await context.addCookies([
		{
			name: "btst.example_session",
			value: `mock-session-${userId}`,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
}
