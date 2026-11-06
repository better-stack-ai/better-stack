/** Verify a SHA-256 HMAC in constant time using the platform crypto implementation. */
export async function verifyHmac(
	secret: string,
	payload: string,
	signature: string,
) {
	if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (hex) =>
		Number.parseInt(hex, 16),
	);
	return crypto.subtle.verify(
		"HMAC",
		key,
		bytes,
		new TextEncoder().encode(payload),
	);
}
