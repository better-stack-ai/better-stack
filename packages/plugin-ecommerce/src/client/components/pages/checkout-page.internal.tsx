"use client";
import { useEffect, useRef, useState } from "react";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { z } from "zod";
import {
	checkoutSchema,
	checkoutQuoteSchema,
	shippingAddressSchema,
} from "../../../schemas";
import type {
	CheckoutQuote,
	CheckoutResult,
	Order,
	ShippingAddress,
} from "../../../types";
import { useCart, type CartItem } from "../../hooks/use-cart";
import type { DiscountResult } from "../../../query-keys";
import { useEcommerceEndpoint } from "../../hooks/use-products";
import {
	useCheckout,
	useValidateDiscount,
	useVerifyCheckoutOrder,
	useCheckoutQuote,
} from "../../hooks/use-orders";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import type { EcommercePluginOverrides } from "../../overrides";
import {
	reusableCheckoutAttempt,
	isTerminalOrder,
	canDiscardCheckoutAttempt,
	type CheckoutAttempt,
} from "../../checkout-attempt";
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

function paymentRedirectUrl(payment: CheckoutResult["payment"]) {
	if (!payment.redirectUrl) return undefined;
	const target = new URL(payment.redirectUrl, window.location.href);
	if (!["https:", "http:"].includes(target.protocol))
		throw new Error("The payment provider returned an invalid redirect URL.");
	return target.href;
}

export function CheckoutPage() {
	const cart = useCart();
	const checkout = useCheckout();
	const verifyOrder = useVerifyCheckoutOrder();
	const submitting = useRef(false);
	const applyingDiscount = useRef(false);
	const [isPreparing, setIsPreparing] = useState(false);
	const [isResuming, setIsResuming] = useState(true);
	const [resumeFailed, setResumeFailed] = useState(false);
	const [resumeVersion, setResumeVersion] = useState(0);
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
	const [paymentInitialized, setPaymentInitialized] = useState(false);
	const [submittedCart, setSubmittedCart] = useState<{
		items: CartItem[];
		discount?: DiscountResult;
		quote?: CheckoutQuote;
		fingerprint: string;
	}>();
	const discountLocked =
		paymentInitialized ||
		isPreparing ||
		checkout.isPending ||
		discount.isPending;
	const key = useRef<string | undefined>(undefined);
	const { PaymentForm } = usePluginOverrides<
		EcommercePluginOverrides,
		Partial<EcommercePluginOverrides>
	>(ECOMMERCE_PLUGIN_ID, {});
	const { navigate } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
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
	const quoteInput = checkoutQuoteSchema.safeParse({
		items,
		shippingAddress: address,
		discountCode: validDiscount ? appliedCode : undefined,
	});
	const quote = useCheckoutQuote(
		quoteInput.success ? quoteInput.data : undefined,
		!paymentInitialized && !isPreparing && !isResuming,
	);
	const fingerprint = JSON.stringify({
		items: cart.items.map(({ productId, variantId, quantity }) => ({
			productId,
			variantId,
			quantity,
		})),
		email,
		address,
		appliedCode: validDiscount ? appliedCode : "",
	});
	const previousFingerprint = useRef(fingerprint);
	useEffect(() => {
		if (fingerprint !== previousFingerprint.current) {
			previousFingerprint.current = fingerprint;
			if (isPreparing || paymentInitialized || isResuming) return;
			key.current = undefined;
			setPayment(undefined);
		}
	}, [fingerprint, isPreparing, paymentInitialized, isResuming]);
	const activeCart =
		isPreparing || paymentInitialized ? submittedCart : undefined;
	const displayItems = activeCart?.items ?? cart.items;
	const displayDiscount = activeCart ? activeCart.discount : validDiscount;
	const displayQuote = activeCart ? activeCart.quote : quote.data;
	const displaySubtotal = displayItems.reduce(
		(total, item) => total + item.price * item.quantity,
		0,
	);
	const complete = (result: CheckoutResult) => {
		void navigate(
			`/shop/orders/${encodeURIComponent(result.orderId)}/confirmation`,
		);
	};
	useEffect(() => {
		if (!cart.isHydrated) return;
		let cancelled = false;
		const checkoutKey = `${cart.storeKey}:checkout`;
		setIsResuming(true);
		key.current = undefined;
		setPayment(undefined);
		setPaymentInitialized(false);
		setSubmittedCart(undefined);
		setResumeFailed(false);
		setValidationError(undefined);
		const restore = async () => {
			let stored: string | null = null;
			let recordRead = false;
			const stillCurrent = () => {
				if (cancelled) return false;
				try {
					return sessionStorage.getItem(checkoutKey) === stored;
				} catch {
					return false;
				}
			};
			try {
				stored = sessionStorage.getItem(checkoutKey);
				recordRead = true;
				const attempt: CheckoutAttempt | null = stored
					? JSON.parse(stored)
					: null;
				if (!attempt?.key || !attempt.fingerprint) return;
				const original = JSON.parse(attempt.fingerprint);
				const input = checkoutSchema.parse({
					items: original.items,
					email: original.email,
					shippingAddress: original.address,
					discountCode: original.appliedCode || undefined,
					idempotencyKey: attempt.key,
				});
				const token = attempt.orderId
					? sessionStorage.getItem(orderTokenKey(attempt.orderId, endpoint))
					: null;
				let result: CheckoutResult | undefined;
				let order: Order | null;
				if (attempt.orderId && token) {
					order = await verifyOrder(attempt.orderId, token);
				} else {
					const uncertainAttempt = JSON.stringify({
						...attempt,
						uncertain: true,
					});
					sessionStorage.setItem(checkoutKey, uncertainAttempt);
					stored = uncertainAttempt;
					result = await checkout.mutateAsync(input);
					if (!stillCurrent()) return;
					paymentRedirectUrl(result.payment);
					sessionStorage.setItem(
						orderTokenKey(result.orderId, endpoint),
						result.accessToken,
					);
					sessionStorage.setItem(
						`${orderTokenKey(result.orderId, endpoint)}:cart`,
						JSON.stringify(input.items),
					);
					const recoveredAttempt = JSON.stringify({
						...attempt,
						orderId: result.orderId,
						uncertain: true,
					});
					sessionStorage.setItem(checkoutKey, recoveredAttempt);
					stored = recoveredAttempt;
					order = await verifyOrder(result.orderId, result.accessToken);
				}
				if (!stillCurrent()) return;
				if (!order)
					throw new Error(
						"Could not verify your previous order. Please retry before starting another payment.",
					);
				if (order.paymentStatus === "paid") {
					await navigate(
						`/shop/orders/${encodeURIComponent(order.id)}/confirmation`,
					);
					return;
				}
				if (isTerminalOrder(order)) {
					sessionStorage.removeItem(checkoutKey);
					key.current = undefined;
					setPayment(undefined);
					setPaymentInitialized(false);
					setSubmittedCart(undefined);
					return;
				}
				result ??= await checkout.mutateAsync(input);
				if (!stillCurrent()) return;
				paymentRedirectUrl(result.payment);
				key.current = attempt.key;
				setEmail(input.email);
				setAddress(input.shippingAddress);
				setCode(input.discountCode ?? "");
				setAppliedCode(input.discountCode ?? "");
				setAppliedFingerprint(JSON.stringify(input.items));
				setSubmittedCart({
					quote: order,
					items: order.lineItems.map((item) => ({
						...item,
						currency: order.currency,
					})),
					discount: input.discountCode
						? {
								code: input.discountCode,
								discount: order.discount,
								subtotal: order.subtotal,
								total: order.total,
								currency: order.currency,
							}
						: undefined,
					fingerprint: JSON.stringify(input.items),
				});
				setPayment(result);
				setPaymentInitialized(true);
				setStep("payment");
			} catch (error) {
				if (!cancelled && (!recordRead || stillCurrent())) {
					setValidationError(
						error instanceof Error ? error : new Error(String(error)),
					);
					setResumeFailed(true);
				}
			} finally {
				if (!cancelled) setIsResuming(false);
			}
		};
		void restore();
		return () => {
			cancelled = true;
		};
	}, [cart.isHydrated, cart.storeKey, resumeVersion]);
	const placeOrder = async () => {
		if (submitting.current || applyingDiscount.current || isResuming) return;
		submitting.current = true;
		setIsPreparing(true);
		setSubmittedCart({
			quote: quote.data,
			items: cart.items.map((item) => ({ ...item })),
			discount: validDiscount,
			fingerprint: discountFingerprint,
		});
		let submittedKey: string | undefined;
		const checkoutKey = `${cart.storeKey}:checkout`;
		try {
			setValidationError(undefined);
			const stored = sessionStorage.getItem(checkoutKey);
			let previous: CheckoutAttempt | undefined;
			if (stored) {
				try {
					previous = JSON.parse(stored);
				} catch {
					/* Invalid saved attempts are replaced below. */
				}
			}
			const reusable = await reusableCheckoutAttempt(
				previous,
				fingerprint,
				async (id) => {
					const token =
						sessionStorage.getItem(orderTokenKey(id, endpoint)) ?? "";
					const order = await verifyOrder(id, token);
					if (!order)
						throw new Error(
							"Could not verify your previous order. Please retry before starting another payment.",
						);
					return order;
				},
			);
			if (previous && typeof previous.key === "string" && !reusable) {
				if (sessionStorage.getItem(checkoutKey) !== stored)
					throw new Error(
						"Your checkout changed in another view. Please retry.",
					);
				sessionStorage.removeItem(checkoutKey);
				key.current = undefined;
				previous = undefined;
				setPaymentInitialized(false);
			}
			if (!key.current && reusable?.key) key.current = reusable.key;
			key.current ??= crypto.randomUUID();
			const idempotencyKey = key.current;
			sessionStorage.setItem(
				checkoutKey,
				JSON.stringify({
					...(reusable?.key === idempotencyKey ? reusable : {}),
					fingerprint,
					key: idempotencyKey,
				}),
			);
			submittedKey = idempotencyKey;
			const result = await checkout.mutateAsync({
				items,
				email,
				shippingAddress: address,
				discountCode: validDiscount ? appliedCode : undefined,
				idempotencyKey,
			});
			const redirectUrl = paymentRedirectUrl(result.payment);
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
			setSubmittedCart((current) =>
				current ? { ...current, quote: result.quote } : current,
			);
			setPaymentInitialized(true);
			if (redirectUrl) window.location.assign(redirectUrl);
			else if (!result.payment.clientSecret) complete(result);
		} catch (cause) {
			if (submittedKey) {
				try {
					const attempt: CheckoutAttempt | undefined = JSON.parse(
						sessionStorage.getItem(checkoutKey) ?? "null",
					);
					const code =
						cause instanceof Error && "code" in cause ? cause.code : undefined;
					if (canDiscardCheckoutAttempt(attempt, submittedKey, code)) {
						sessionStorage.removeItem(checkoutKey);
						setSubmittedCart(undefined);
						if (key.current === submittedKey) key.current = undefined;
					} else if (attempt?.key === submittedKey) {
						sessionStorage.setItem(
							checkoutKey,
							JSON.stringify({ ...attempt, uncertain: true }),
						);
					}
				} catch {
					/* Preserve an uncertain attempt when storage cleanup fails. */
				}
			}
			setValidationError(
				cause instanceof Error ? cause : new Error(String(cause)),
			);
		} finally {
			submitting.current = false;
			setIsPreparing(false);
		}
	};
	return (
		<Storefront>
			{!cart.isHydrated ? (
				<p role="status">Loading cart…</p>
			) : isResuming ? (
				<p role="status">Restoring checkout…</p>
			) : resumeFailed ? (
				<section className="space-y-4 py-8">
					<h1 className="text-2xl font-semibold">
						Resume your previous payment
					</h1>
					<ErrorMessage error={validationError} />
					<p className="text-sm text-muted-foreground">
						Use the same account and browser that started this payment. If the
						problem continues, contact the shop before starting another order.
					</p>
					<Button onClick={() => setResumeVersion((version) => version + 1)}>
						Retry previous payment
					</Button>
				</section>
			) : displayItems.length ? (
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
											disabled={
												paymentInitialized || checkout.isPending || isPreparing
											}
										>
											Edit shipping
										</Button>
									</div>
									<p className="text-sm leading-6 text-muted-foreground">
										Your payment provider will confirm the final total and
										complete payment securely.
									</p>
									<ErrorMessage error={validationError ?? checkout.error} />
									{payment?.payment.redirectUrl ? (
										<Button asChild className="h-11 w-full">
											<a href={payment.payment.redirectUrl}>
												Resume secure payment
											</a>
										</Button>
									) : payment?.payment.clientSecret ? (
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
											disabled={
												checkout.isPending ||
												isPreparing ||
												discount.isPending ||
												!quote.data ||
												quote.isFetching ||
												quote.isError
											}
											onClick={() => void placeOrder()}
										>
											{checkout.isPending || isPreparing
												? "Preparing payment…"
												: "Continue to secure payment"}
										</Button>
									)}
								</div>
							)}
						</section>
						<aside className="rounded-lg bg-muted/40 p-6">
							<h2 className="text-lg font-medium">Order summary</h2>
							{activeCart && activeCart.fingerprint !== discountFingerprint ? (
								<p role="status" className="mt-3 text-sm text-muted-foreground">
									This payment is for the items shown below. Cart changes apply
									to a future order.
								</p>
							) : null}
							<ul className="mt-4 divide-y">
								{displayItems.map((item) => (
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
									if (
										submitting.current ||
										applyingDiscount.current ||
										paymentInitialized
									)
										return;
									applyingDiscount.current = true;
									try {
										await discount.mutateAsync({ code, items });
										setAppliedCode(code.trim());
										setAppliedFingerprint(discountFingerprint);
									} catch {
										setAppliedCode("");
									} finally {
										applyingDiscount.current = false;
									}
								}}
							>
								<label className="text-sm" htmlFor="discount-code">
									Discount code
								</label>
								<div className="flex gap-2">
									<Input
										id="discount-code"
										disabled={discountLocked}
										value={code}
										onChange={(event) => setCode(event.target.value)}
									/>
									<Button
										variant="outline"
										type="submit"
										disabled={!code.trim() || discountLocked}
									>
										{discount.isPending ? "Checking…" : "Apply"}
									</Button>
								</div>
								<ErrorMessage error={discount.error} />
							</form>
							{displayDiscount ? (
								<p role="status" className="mt-4 flex justify-between text-sm">
									<span>{displayDiscount.code} applied</span>
									<span>
										−
										{formatMoney(
											displayDiscount.discount,
											displayDiscount.currency,
										)}
									</span>
								</p>
							) : null}
							<dl
								aria-label="Checkout totals"
								className="mt-6 space-y-2 border-t pt-4 text-sm"
							>
								{[
									["Subtotal", displayQuote?.subtotal ?? displaySubtotal],
									[
										"Discount",
										-(displayQuote?.discount ?? displayDiscount?.discount ?? 0),
									],
									["Shipping", displayQuote?.shipping],
									["Tax", displayQuote?.tax],
									["Total", displayQuote?.total],
								].map(([label, amount]) => (
									<div
										key={label}
										className={`flex justify-between ${label === "Total" ? "border-t pt-3 font-semibold" : ""}`}
									>
										<dt>{label}</dt>
										<dd className="tabular-nums">
											{typeof amount === "number"
												? formatMoney(
														amount,
														displayQuote?.currency ??
															displayItems[0]?.currency ??
															"USD",
													)
												: "Pending"}
										</dd>
									</div>
								))}
							</dl>
							{!activeCart ? (
								<>
									<ErrorMessage error={quote.error} />
									{quote.error ? (
										<Button
											variant="outline"
											className="mt-3"
											disabled={quote.isFetching}
											onClick={() => void quote.refetch()}
										>
											Retry quote
										</Button>
									) : null}
									{quoteInput.success && !quote.data && !quote.error ? (
										<p className="mt-3 text-xs text-muted-foreground">
											Calculating shipping and tax…
										</p>
									) : null}
								</>
							) : null}
							<p className="mt-3 text-xs leading-5 text-muted-foreground">
								{displayQuote || quoteInput.success
									? "Prices are recalculated when your order is created."
									: "Enter your shipping address to see shipping, tax, and the total."}
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
