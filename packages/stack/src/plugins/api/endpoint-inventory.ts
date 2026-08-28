import type { Endpoint } from "better-call";
import {
	getRouteEndpointOperationBinding,
	type AnyOperation,
	type OperationRecord,
} from "./operation";

/** A true infrastructure route that intentionally bypasses business operations. */
export interface InfrastructureRouteDeclaration {
	/** Infrastructure access is explicit and currently limited to public metadata. */
	readonly access: "public";
	/** Why this route cannot use the business-operation pipeline. */
	readonly rationale: string;
}

/** Narrow route-key allowlist for a backend plugin's infrastructure handlers. */
export type InfrastructureRouteInventory = Readonly<
	Record<string, InfrastructureRouteDeclaration>
>;

/** Safe authorization metadata for one composed HTTP endpoint. */
export interface ComposedEndpointInventoryEntry {
	readonly pluginKey: string;
	readonly pluginName: string;
	readonly routeKey: string;
	readonly method: string;
	readonly path: string;
	readonly source: "operation" | "infrastructure";
	readonly access: "permission" | "public";
	readonly permissionId?: string;
}

type RuntimeEndpoint = Endpoint & {
	readonly path?: unknown;
	readonly options?: { readonly method?: unknown };
};

function endpointIdentity(endpoint: Endpoint): {
	method: string;
	path: string;
} {
	const runtimeEndpoint = endpoint as RuntimeEndpoint;
	const method = runtimeEndpoint.options?.method;
	return {
		method: Array.isArray(method)
			? method.map(String).join("|").toUpperCase()
			: String(method ?? "GET").toUpperCase(),
		path:
			typeof runtimeEndpoint.path === "string"
				? runtimeEndpoint.path
				: "<unknown-path>",
	};
}

function operationInventoryEntry(
	pluginKey: string,
	pluginName: string,
	routeKey: string,
	endpoint: Endpoint,
	operation: AnyOperation,
): ComposedEndpointInventoryEntry {
	const identity = endpointIdentity(endpoint);
	if (operation.access === "public") {
		return Object.freeze({
			pluginKey,
			pluginName,
			routeKey,
			...identity,
			source: "operation" as const,
			access: "public" as const,
		});
	}
	const permissionId = operation.permission?.id;
	if (typeof permissionId !== "string" || permissionId.length === 0) {
		throw new TypeError(
			`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) has no stable permission id.`,
		);
	}
	return Object.freeze({
		pluginKey,
		pluginName,
		routeKey,
		...identity,
		source: "operation" as const,
		access: "permission" as const,
		permissionId,
	});
}

/** @internal Validate one plugin's routes and return their safe inventory. */
export function composeEndpointInventory(
	pluginKey: string,
	pluginName: string,
	routes: Record<string, Endpoint>,
	operations: OperationRecord,
	requireCompleteInventory: boolean,
	infrastructureRoutes?: InfrastructureRouteInventory,
	operationRouteMap?: Readonly<Record<string, string>>,
): readonly ComposedEndpointInventoryEntry[] {
	const strictInventory =
		requireCompleteInventory ||
		infrastructureRoutes !== undefined ||
		operationRouteMap !== undefined;
	if (!strictInventory) return [];

	const infrastructure = infrastructureRoutes ?? {};
	const routeMap = operationRouteMap ?? {};
	for (const routeKey of Object.keys(routeMap).sort()) {
		if (!Object.hasOwn(routes, routeKey)) {
			throw new TypeError(
				`[btst/endpoint-inventory] Plugin "${pluginKey}" operation route mapping "${routeKey}" has no composed endpoint.`,
			);
		}
		const operationKey = routeMap[routeKey];
		if (
			typeof operationKey !== "string" ||
			operationKey.length === 0 ||
			!Object.hasOwn(operations, operationKey)
		) {
			throw new TypeError(
				`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" maps to unknown operation "${String(operationKey)}".`,
			);
		}
	}
	for (const routeKey of Object.keys(infrastructure).sort()) {
		if (!Object.hasOwn(routes, routeKey)) {
			throw new TypeError(
				`[btst/endpoint-inventory] Plugin "${pluginKey}" infrastructure route "${routeKey}" has no composed endpoint.`,
			);
		}
		const declaration = infrastructure[routeKey];
		if (
			declaration?.access !== "public" ||
			typeof declaration.rationale !== "string" ||
			declaration.rationale.trim().length === 0
		) {
			throw new TypeError(
				`[btst/endpoint-inventory] Plugin "${pluginKey}" infrastructure route "${routeKey}" must declare public access and a rationale.`,
			);
		}
	}

	return Object.freeze(
		Object.entries(routes).map(([routeKey, endpoint]) => {
			const operationKey = Object.hasOwn(routeMap, routeKey)
				? routeMap[routeKey]
				: routeKey;
			const operation =
				typeof operationKey === "string" &&
				Object.hasOwn(operations, operationKey)
					? operations[operationKey]
					: undefined;
			const infrastructureDeclaration = Object.hasOwn(infrastructure, routeKey)
				? infrastructure[routeKey]
				: undefined;
			const identity = endpointIdentity(endpoint);
			const binding = getRouteEndpointOperationBinding(endpoint);
			if (operation && infrastructureDeclaration) {
				throw new TypeError(
					`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) cannot be both operation-backed and infrastructure.`,
				);
			}
			if (operation) {
				if (binding === undefined) {
					throw new TypeError(
						`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) must use an operations.${operationKey}.route(ctx => input) handler.`,
					);
				}
				if (
					binding.pluginKey !== pluginKey ||
					binding.operationKey !== operationKey ||
					binding.operation !== operation
				) {
					throw new TypeError(
						`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) maps to operation "${operationKey}" but is bound to "${binding.pluginKey}.${binding.operationKey}".`,
					);
				}
				return operationInventoryEntry(
					pluginKey,
					pluginName,
					routeKey,
					endpoint,
					operation,
				);
			}
			if (infrastructureDeclaration) {
				if (binding !== undefined) {
					throw new TypeError(
						`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) cannot be both operation-backed and infrastructure.`,
					);
				}
				return Object.freeze({
					pluginKey,
					pluginName,
					routeKey,
					...identity,
					source: "infrastructure" as const,
					access: "public" as const,
				});
			}
			throw new TypeError(
				`[btst/endpoint-inventory] Plugin "${pluginKey}" route "${routeKey}" (${identity.method} ${identity.path}) has no same-key operation or infrastructure declaration.`,
			);
		}),
	);
}
