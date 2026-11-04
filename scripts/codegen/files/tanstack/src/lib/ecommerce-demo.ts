import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentAdapter } from "@btst/stack/plugins/ecommerce/api";

// These credentials are fixtures for the generated E2E apps, never a live provider.
const DEMO_SECRET = "btst-ecommerce-e2e-only";

export const ecommerceDemoPaymentAdapter: PaymentAdapter = {
 async createPayment({ orderId }) {
  return { redirectUrl: `/pages/shop/orders/${orderId}/confirmation` };
 },
 async handleWebhook(request) {
  const body = await request.text();
  const signature = request.headers.get("x-demo-signature") ?? "";
  const expected = createHmac("sha256", DEMO_SECRET).update(body).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid demo payment signature");
  const event = JSON.parse(body);
  if (typeof event.orderId !== "string" || event.status !== "paid" || typeof event.paymentRef !== "string" || !Number.isSafeInteger(event.amount) || typeof event.currency !== "string") return null;
  return event;
 },
};
