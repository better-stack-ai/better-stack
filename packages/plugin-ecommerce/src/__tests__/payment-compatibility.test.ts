import { expect, expectTypeOf, it } from "vitest";
import {
	lemonSqueezyAdapter,
	stripeAdapter,
	verifyHmac,
	type PaymentAdapter,
	type PaymentWebhookResult,
} from "@btst/stack/payments";
import * as ecommerce from "../api";
import { stripeAdapter as legacyStripe } from "../api/adapters/stripe";
import { lemonSqueezyAdapter as legacyLemon } from "../api/adapters/lemon-squeezy";
import { verifyHmac as legacyVerifyHmac } from "../api/adapters/signatures";
import type {
	PaymentAdapter as LegacyAdapter,
	PaymentWebhookResult as LegacyResult,
} from "../api/payment-adapter";

it("preserves Ecommerce public and internal payment exports as Core re-exports", () => {
	expect(ecommerce.stripeAdapter).toBe(stripeAdapter);
	expect(legacyStripe).toBe(stripeAdapter);
	expect(ecommerce.lemonSqueezyAdapter).toBe(lemonSqueezyAdapter);
	expect(legacyLemon).toBe(lemonSqueezyAdapter);
	expect(legacyVerifyHmac).toBe(verifyHmac);
	expectTypeOf<ecommerce.PaymentAdapter>().toEqualTypeOf<PaymentAdapter>();
	expectTypeOf<LegacyAdapter>().toEqualTypeOf<PaymentAdapter>();
	expectTypeOf<ecommerce.PaymentWebhookResult>().toEqualTypeOf<PaymentWebhookResult>();
	expectTypeOf<LegacyResult>().toEqualTypeOf<PaymentWebhookResult>();
});
