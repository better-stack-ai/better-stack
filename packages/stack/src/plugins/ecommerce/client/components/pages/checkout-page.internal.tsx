"use client";
import { useEffect, useRef, useState } from "react";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { z } from "zod";
import { shippingAddressSchema } from "../../../schemas";
import type { CheckoutResult, ShippingAddress } from "../../../types";
import { useCart } from "../../hooks/use-cart";
import { useEcommerceEndpoint } from "../../hooks/use-products";
import { useCheckout, useValidateDiscount } from "../../hooks/use-orders";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import type { EcommercePluginOverrides } from "../../overrides";
import { orderTokenKey } from "../../order-access";
import {
	EmptyCart,
	ErrorMessage,
	Storefront,
	formatMoney,
} from "../storefront";

const addressFields = [
	["name", "Full name", "name"],
	["line1", "Address", "address-line1"],
	["line2", "Apartment, suite, etc. (optional)", "address-line2"],
	["city", "City", "address-level2"],
	["region", "State / region (optional)", "address-level1"],
	["postalCode", "Postal code", "postal-code"],
	["country", "Country code", "country"],
] as const;

export function CheckoutPage() {
	const cart = useCart();
	const checkout = useCheckout();
	const endpoint = useEcommerceEndpoint();
	const discount = useValidateDiscount();
	const [step, setStep] = useState<"shipping" | "payment">("shipping");
	const [email, setEmail] = useState("");
	const [address, setAddress] = useState<ShippingAddress>({
		name: "",
		line1: "",
		line2: "",
		city: "",
		region: "",
		postalCode: "",
		country: "US",
	});
	const [code, setCode] = useState("");
	const [appliedCode, setAppliedCode] = useState("");
	const [validationError, setValidationError] = useState<Error>();
	const [payment, setPayment] = useState<CheckoutResult>();
	const key = useRef<string | undefined>(undefined);
	const { PaymentForm } = usePluginOverrides<
		EcommercePluginOverrides,
		Partial<EcommercePluginOverrides>
	>(ECOMMERCE_PLUGIN_ID, {});
	const { navigate } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	const fingerprint = JSON.stringify({
		items: cart.items.map(({ productId, variantId, quantity }) => ({
			productId,
			variantId,
			quantity,
		})),
		email,
		address,
		appliedCode,
	});
	const previousFingerprint = useRef(fingerprint);
	useEffect(() => {
		if (fingerprint !== previousFingerprint.current) {
			previousFingerprint.current = fingerprint;
			key.current = undefined;
			setPayment(undefined);
		}
	}, [fingerprint]);
	const items = cart.items.map(({ productId, variantId, quantity }) => ({
		productId,
		variantId,
		quantity,
	}));
	const discountFingerprint = JSON.stringify(items);
	const [appliedFingerprint, setAppliedFingerprint] = useState("");
	const validDiscount =
		appliedFingerprint === discountFingerprint && appliedCode === code.trim()
			? discount.data
			: undefined;
	const complete = (result: CheckoutResult) => {
		void navigate(
			`/shop/orders/${encodeURIComponent(result.orderId)}/confirmation`,
		);
	};
	const placeOrder = async () => {
		try {
			setValidationError(undefined);
			const checkoutKey = `${cart.storeKey}:checkout`;
			const stored = sessionStorage.getItem(checkoutKey);
			let previous:
				| { fingerprint?: string; key?: string; orderId?: string }
				| undefined;
			if (stored) {
				try {
					previous = JSON.parse(stored);
				} catch {
					/* Invalid saved attempts are replaced below. */
				}
			}
			if (
				!key.current &&
				previous?.fingerprint === fingerprint &&
				typeof previous.key === "string"
			)
				key.current = previous.key;
			key.current ??= crypto.randomUUID();
			const idempotencyKey = key.current;
			sessionStorage.setItem(
				checkoutKey,
				JSON.stringify({
					...(previous?.key === idempotencyKey ? previous : {}),
					fingerprint,
					key: idempotencyKey,
				}),
			);
			const result = await checkout.mutateAsync({
				items,
				email,
				shippingAddress: address,
				discountCode: validDiscount ? appliedCode : undefined,
				idempotencyKey,
			});
			try {
				const attempt = JSON.parse(
					sessionStorage.getItem(checkoutKey) ?? "null",
				);
				if (attempt?.key === idempotencyKey) {
					sessionStorage.setItem(
						checkoutKey,
						JSON.stringify({ ...attempt, orderId: result.orderId }),
					);
				}
				sessionStorage.setItem(
					orderTokenKey(result.orderId, endpoint),
					result.accessToken,
				);
				sessionStorage.setItem(
					`${orderTokenKey(result.orderId, endpoint)}:cart`,
					JSON.stringify(items),
				);
			} catch {
				throw new Error(
					"Allow session storage to keep your secure order access, then retry payment.",
				);
			}
			setPayment(result);
			if (result.payment.redirectUrl) {
				const target = new URL(
					result.payment.redirectUrl,
					window.location.href,
				);
				if (!["https:", "http:"].includes(target.protocol))
					throw new Error(
						"The payment provider returned an invalid redirect URL.",
					);
				window.location.assign(target.href);
			} else if (!result.payment.clientSecret) complete(result);
		} catch (cause) {
			setValidationError(
				cause instanceof Error ? cause : new Error(String(cause)),
			);
		}
	};
	return (
		<Storefront>
			{!cart.isHydrated ? (
				<p role="status">Loading cart…</p>
			) : cart.items.length ? (
				<>
					<h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
					<ol
						aria-label="Checkout progress"
						className="my-7 flex flex-wrap gap-6 text-sm"
					>
						<li>Cart</li>
						<li
							aria-current={step === "shipping" ? "step" : undefined}
							className={
								step === "shipping" ? "font-semibold" : "text-muted-foreground"
							}
						>
							Shipping
						</li>
						<li
							aria-current={step === "payment" ? "step" : undefined}
							className={
								step === "payment" ? "font-semibold" : "text-muted-foreground"
							}
						>
							Payment
						</li>
						<li className="text-muted-foreground">Confirmation</li>
					</ol>
					<div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
						<section>
							{step === "shipping" ? (
								<form
									className="space-y-5"
									onSubmit={(event) => {
										event.preventDefault();
										const parsed = z
											.object({
												email: z.email(),
												address: shippingAddressSchema,
											})
											.safeParse({ email, address });
										if (!parsed.success) {
											setValidationError(
												new Error(
													parsed.error.issues
														.map(
															(issue) =>
																`${issue.path.join(" ")}: ${issue.message}`,
														)
														.join("; "),
												),
											);
											return;
										}
										setAddress(parsed.data.address);
										setEmail(parsed.data.email);
										setValidationError(undefined);
										setStep("payment");
									}}
								>
									<h2 className="text-xl font-medium">Shipping address</h2>
									<label className="block text-sm">
										Email
										<Input
											className="mt-2"
											type="email"
											autoComplete="email"
											required
											value={email}
											onChange={(event) => setEmail(event.target.value)}
										/>
									</label>
									{addressFields.map(([name, label, autoComplete]) => (
										<label className="block text-sm" key={name}>
											{label}
											<Input
												className="mt-2"
												autoComplete={autoComplete}
												required={name !== "line2" && name !== "region"}
												maxLength={name === "country" ? 2 : 200}
												placeholder={name === "country" ? "US" : undefined}
												value={address[name] ?? ""}
												onChange={(event) =>
													setAddress((current) => ({
														...current,
														[name]:
															name === "country"
																? event.target.value.toUpperCase()
																: event.target.value,
													}))
												}
											/>
										</label>
									))}
									<ErrorMessage error={validationError} />
									<Button type="submit" className="h-11">
										Continue to payment
									</Button>
								</form>
							) : (
								<div className="space-y-6">
									<div className="flex items-start justify-between gap-4">
										<div>
											<h2 className="text-xl font-medium">Payment</h2>
											<p className="mt-2 text-sm text-muted-foreground">
												{email}
											</p>
											<p className="mt-1 text-sm text-muted-foreground">
												{address.line1}, {address.city}, {address.postalCode}
											</p>
										</div>
										<Button
											variant="ghost"
											onClick={() => setStep("shipping")}
											disabled={checkout.isPending}
										>
											Edit shipping
										</Button>
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										Your payment provider will confirm the final total and
										complete payment securely.
									</p>
									<ErrorMessage error={validationError ?? checkout.error} />
									{payment?.payment.clientSecret ? (
										PaymentForm ? (
											<PaymentForm
												clientSecret={payment.payment.clientSecret}
												orderId={payment.orderId}
												onComplete={() => complete(payment)}
											/>
										) : (
											<p role="alert" className="text-sm text-destructive">
												This payment provider requires a payment form. Configure
												the Ecommerce PaymentForm override to continue.
											</p>
										)
									) : (
										<Button
											className="h-11 w-full"
											disabled={checkout.isPending}
											onClick={() => void placeOrder()}
										>
											{checkout.isPending
												? "Preparing payment…"
												: "Continue to secure payment"}
										</Button>
									)}
								</div>
							)}
						</section>
						<aside className="rounded-lg bg-muted/40 p-6">
							<h2 className="text-lg font-medium">Order summary</h2>
							<ul className="mt-4 divide-y">
								{cart.items.map((item) => (
									<li
										key={`${item.productId}:${item.variantId ?? ""}`}
										className="flex justify-between gap-3 py-3 text-sm"
									>
										<span>
											{item.name}
											{item.variantName ? ` (${item.variantName})` : ""} ×{" "}
											{item.quantity}
										</span>
										<span className="shrink-0 tabular-nums">
											{formatMoney(item.price * item.quantity, item.currency)}
										</span>
									</li>
								))}
							</ul>
							<form
								className="mt-5 space-y-2"
								onSubmit={async (event) => {
									event.preventDefault();
									try {
										await discount.mutateAsync({ code, items });
										setAppliedCode(code.trim());
										setAppliedFingerprint(discountFingerprint);
									} catch {
										setAppliedCode("");
									}
								}}
							>
								<label className="text-sm" htmlFor="discount-code">
									Discount code
								</label>
								<div className="flex gap-2">
									<Input
										id="discount-code"
										value={code}
										onChange={(event) => setCode(event.target.value)}
									/>
									<Button
										variant="outline"
										type="submit"
										disabled={!code.trim() || discount.isPending}
									>
										{discount.isPending ? "Checking…" : "Apply"}
									</Button>
								</div>
								<ErrorMessage error={discount.error} />
							</form>
							{validDiscount ? (
								<p role="status" className="mt-4 flex justify-between text-sm">
									<span>{validDiscount.code} applied</span>
									<span>
										−
										{formatMoney(
											validDiscount.discount,
											validDiscount.currency,
										)}
									</span>
								</p>
							) : null}
							<p className="mt-6 flex justify-between border-t pt-4 font-medium">
								<span>{validDiscount ? "After discount" : "Subtotal"}</span>
								<span className="tabular-nums">
									{formatMoney(
										validDiscount?.total ?? cart.subtotal,
										validDiscount?.currency ?? cart.items[0]?.currency ?? "USD",
									)}
								</span>
							</p>
							<p className="mt-3 text-xs leading-5 text-muted-foreground">
								Shipping and final prices are confirmed by the server before
								payment.
							</p>
						</aside>
					</div>
				</>
			) : (
				<EmptyCart />
			)}
		</Storefront>
	);
}
