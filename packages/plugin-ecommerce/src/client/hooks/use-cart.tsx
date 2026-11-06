"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useStack } from "@btst/stack/context";
import { z } from "zod";
import { ECOMMERCE_PLUGIN_ID } from "../constants";

const CartItemSchema = z.object({
	productId: z.string().min(1),
	variantId: z.string().optional(),
	name: z.string(),
	variantName: z.string().optional(),
	price: z.number().int().nonnegative(),
	currency: z.string().length(3),
	image: z.string().optional(),
	quantity: z.number().int().min(1).max(99),
});

/** Display snapshots are untrusted; checkout resolves prices and stock on the server. */
export type CartItem = z.infer<typeof CartItemSchema>;
const CartSchema = z.object({
	version: z.literal(1),
	items: z.array(CartItemSchema).max(50),
});
const EMPTY_CART: CartItem[] = [];
interface CartStore {
	items: CartItem[];
	listeners: Set<() => void>;
	loaded: boolean;
	storageAvailable: boolean;
}
const stores = new Map<string, CartStore>();

function getStore(key: string): CartStore {
	let store = stores.get(key);
	if (!store) {
		store = {
			items: EMPTY_CART,
			listeners: new Set(),
			loaded: false,
			storageAvailable: true,
		};
		stores.set(key, store);
	}
	return store;
}

function readCart(value: string | null): CartItem[] {
	if (!value) return EMPTY_CART;
	try {
		const result = CartSchema.safeParse(JSON.parse(value));
		return result.success ? result.data.items : EMPTY_CART;
	} catch {
		return EMPTY_CART;
	}
}

function publish(key: string, items: CartItem[]) {
	const store = getStore(key);
	store.items = items;
	try {
		localStorage.setItem(key, JSON.stringify({ version: 1, items }));
	} catch {
		store.storageAvailable = false;
	}
	for (const listener of store.listeners) listener();
}

/** Persistent cart shared across storefront pages and drawers, scoped to the resolved store. */
export function useCart() {
	const { api, plugins, site, basePath } = useStack();
	const runtime = plugins?.[ECOMMERCE_PLUGIN_ID];
	const key = `btst:ecommerce:cart:v1:${JSON.stringify([
		runtime?.api.baseURL ?? api?.baseURL ?? "",
		runtime?.api.basePath ?? api?.basePath ?? "",
		runtime?.site.baseURL ?? site?.baseURL ?? "",
		runtime?.site.basePath ?? basePath,
	])}`;
	const [hydratedKey, setHydratedKey] = useState<string | null>(null);
	const items = useSyncExternalStore(
		(listener) => {
			const store = getStore(key);
			store.listeners.add(listener);
			return () => store.listeners.delete(listener);
		},
		() => getStore(key).items,
		() => EMPTY_CART,
	);
	useEffect(() => {
		const store = getStore(key);
		if (!store.loaded) {
			store.loaded = true;
			try {
				store.items = readCart(localStorage.getItem(key));
			} catch {
				store.storageAvailable = false;
			}
			for (const listener of store.listeners) listener();
		}
		setHydratedKey(key);
		const onStorage = (event: StorageEvent) => {
			if (event.key !== key && event.key !== null) return;
			store.items = readCart(event.newValue);
			for (const listener of store.listeners) listener();
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [key]);
	return {
		items,
		isHydrated: hydratedKey === key,
		count: items.reduce((sum, item) => sum + item.quantity, 0),
		subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
		storageAvailable:
			typeof window === "undefined" || getStore(key).storageAvailable,
		storeKey: key,
		addItem(input: Omit<CartItem, "quantity"> & { quantity?: number }) {
			const item = CartItemSchema.parse({
				...input,
				quantity: input.quantity ?? 1,
			});
			const current = getStore(key).items;
			if (current.length && current[0]?.currency !== item.currency) {
				throw new Error(
					"Choose products in the same currency before checking out.",
				);
			}
			const existing = current.find(
				(entry) =>
					entry.productId === item.productId &&
					entry.variantId === item.variantId,
			);
			if (existing) {
				publish(
					key,
					current.map((entry) =>
						entry === existing
							? {
									...item,
									quantity: Math.min(99, entry.quantity + item.quantity),
								}
							: entry,
					),
				);
			} else {
				if (current.length >= 50)
					throw new Error("Your cart can contain up to 50 different items.");
				publish(key, [...current, item]);
			}
		},
		removeItem(productId: string, variantId?: string) {
			publish(
				key,
				getStore(key).items.filter(
					(item) =>
						item.productId !== productId || item.variantId !== variantId,
				),
			);
		},
		updateQuantity(
			productId: string,
			variantId: string | undefined,
			quantity: number,
		) {
			if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
			publish(
				key,
				getStore(key).items.map((item) =>
					item.productId === productId && item.variantId === variantId
						? { ...item, quantity }
						: item,
				),
			);
		},
		clear() {
			publish(key, EMPTY_CART);
		},
	};
}
