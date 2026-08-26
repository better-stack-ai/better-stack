import { z } from "zod";

const permissionSeedMarker = Symbol("btst.permission-seed");
const permissionDescriptorMarker = Symbol("btst.permission-descriptor");
const permissionCatalogMarker = Symbol("btst.permission-catalog");

type AnySchema = z.ZodType<any, any>;

/** A permission declaration before its stable catalog id has been assigned. */
export interface PermissionSeed<TSchema extends AnySchema | undefined> {
	readonly [permissionSeedMarker]: true;
	readonly schema: TSchema;
}

type PermissionFacts<TSchema extends AnySchema | undefined> =
	TSchema extends AnySchema ? z.output<TSchema> : undefined;

type PermissionInput<TSchema extends AnySchema | undefined> =
	TSchema extends AnySchema ? [facts: z.input<TSchema>] : [];

/** A validated permission request passed to client and server evaluators. */
export interface PermissionRequest<
	TId extends string = string,
	TSchema extends AnySchema | undefined = AnySchema | undefined,
> {
	readonly id: TId;
	readonly permission: PermissionDescriptor<TId, TSchema>;
	readonly facts: PermissionFacts<TSchema>;
}

/** A stable, callable permission descriptor produced by `definePermissions`. */
export interface PermissionDescriptor<
	TId extends string = string,
	TSchema extends AnySchema | undefined = AnySchema | undefined,
> {
	(...args: PermissionInput<TSchema>): PermissionRequest<TId, TSchema>;
	readonly id: TId;
	readonly schema: TSchema;
	readonly [permissionDescriptorMarker]: true;
}

type PermissionTree = {
	readonly [key: string]:
		| PermissionTree
		| PermissionSeed<AnySchema | undefined>;
};

type AppendPath<TPath extends string, TKey extends string> = TPath extends ""
	? TKey
	: `${TPath}.${TKey}`;

type BoundPermissionTree<
	TTree,
	TNamespace extends string,
	TPath extends string = "",
> = TTree extends PermissionSeed<infer TSchema>
	? PermissionDescriptor<`${TNamespace}:${TPath}`, TSchema>
	: {
			readonly [TKey in keyof TTree]: TKey extends string
				? BoundPermissionTree<TTree[TKey], TNamespace, AppendPath<TPath, TKey>>
				: never;
		};

/** A named catalog of permission descriptors. */
export type PermissionCatalog<
	TName extends string = string,
	TTree extends PermissionTree = PermissionTree,
> = BoundPermissionTree<TTree, TName> & {
	readonly [permissionCatalogMarker]: {
		readonly name: TName;
	};
};

type AnyPermissionCatalog = PermissionCatalog<string, PermissionTree>;
/** Any schema-backed permission descriptor, for generic plugin APIs. */
export type AnyPermissionDescriptor = PermissionDescriptor<
	string,
	AnySchema | undefined
>;
type AnyPermissionRequest = PermissionRequest<string, AnySchema | undefined>;

/** Declare a permission whose checks do not need record facts. */
export function permission(): PermissionSeed<undefined>;
/** Declare a permission whose fact type is inferred from its runtime schema. */
export function permission<TSchema extends AnySchema>(
	schema: TSchema,
): PermissionSeed<TSchema>;
export function permission<TSchema extends AnySchema>(
	schema?: TSchema,
): PermissionSeed<TSchema | undefined> {
	return Object.freeze({
		[permissionSeedMarker]: true as const,
		schema,
	});
}

function isPermissionSeed(
	value: unknown,
): value is PermissionSeed<AnySchema | undefined> {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as PermissionSeed<AnySchema | undefined>)[permissionSeedMarker] ===
			true
	);
}

function isPermissionDescriptor(
	value: unknown,
): value is AnyPermissionDescriptor {
	return (
		typeof value === "function" &&
		(value as AnyPermissionDescriptor)[permissionDescriptorMarker] === true
	);
}

function createPermissionDescriptor(
	id: string,
	schema: AnySchema | undefined,
): AnyPermissionDescriptor {
	const descriptor = ((...args: [unknown?]) => {
		if (!schema && args.length > 0) {
			throw new TypeError(`Permission "${id}" does not accept facts.`);
		}
		const facts = schema ? schema.parse(args[0]) : undefined;
		return Object.freeze({ id, permission: descriptor, facts });
	}) as unknown as AnyPermissionDescriptor;

	Object.defineProperties(descriptor, {
		id: { value: id, enumerable: true },
		schema: { value: schema, enumerable: true },
		[permissionDescriptorMarker]: { value: true },
	});

	return Object.freeze(descriptor);
}

function bindPermissionTree(
	namespace: string,
	tree: PermissionTree,
	path = "",
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(tree)) {
		const nextPath = path ? `${path}.${key}` : key;
		result[key] = isPermissionSeed(value)
			? createPermissionDescriptor(`${namespace}:${nextPath}`, value.schema)
			: bindPermissionTree(namespace, value, nextPath);
	}
	return Object.freeze(result);
}

/**
 * Assign stable ids to a plugin's schema-backed permission declarations.
 * The returned tree is safe to import from both browser and server modules.
 */
export function definePermissions<
	const TName extends string,
	const TTree extends PermissionTree,
>(name: TName, tree: TTree): PermissionCatalog<TName, TTree> {
	const catalog = { ...bindPermissionTree(name, tree) } as PermissionCatalog<
		TName,
		TTree
	>;
	Object.defineProperty(catalog, permissionCatalogMarker, {
		value: Object.freeze({ name }),
	});
	return Object.freeze(catalog) as PermissionCatalog<TName, TTree>;
}

type DescriptorsIn<T> = T extends AnyPermissionDescriptor
	? T
	: T extends object
		? {
				[TKey in keyof T]: TKey extends typeof permissionCatalogMarker
					? never
					: DescriptorsIn<T[TKey]>;
			}[keyof T]
		: never;

type RegisteredDescriptor<TCatalogs extends readonly AnyPermissionCatalog[]> =
	DescriptorsIn<TCatalogs[number]>;

type RequestFor<TDescriptor> = TDescriptor extends PermissionDescriptor<
	infer TId,
	infer TSchema
>
	? PermissionRequest<TId, TSchema>
	: never;

/** Infer validated fact output for a permission descriptor. */
export type PermissionFactsFor<TPermission> =
	TPermission extends PermissionDescriptor<infer _TId, infer TSchema>
		? PermissionFacts<TSchema>
		: never;

/** Infer accepted fact input for a permission descriptor. */
export type PermissionInputFor<TPermission> =
	TPermission extends PermissionDescriptor<infer _TId, infer TSchema>
		? TSchema extends AnySchema
			? z.input<TSchema>
			: undefined
		: never;

/** Infer the validated request created by a permission descriptor. */
export type PermissionRequestFor<TPermission> = RequestFor<TPermission>;

interface AuthorizationRuleDefinition {
	readonly permission: AnyPermissionDescriptor;
	readonly evaluate: (input: { identity: unknown; facts: unknown }) => boolean;
}

type RulePermission<TPermission, TIdentity> =
	TPermission extends PermissionDescriptor<infer _TId, infer TSchema>
		? {
				allow: () => AuthorizationRuleDefinition;
				when: (
					rule: (input: {
						identity: TIdentity | null;
						facts: PermissionFacts<TSchema>;
					}) => boolean,
				) => AuthorizationRuleDefinition;
			}
		: never;

type RuleTree<TTree, TIdentity> = TTree extends AnyPermissionDescriptor
	? RulePermission<TTree, TIdentity>
	: TTree extends object
		? {
				[TKey in keyof TTree as TKey extends typeof permissionCatalogMarker
					? never
					: TKey]: RuleTree<TTree[TKey], TIdentity>;
			}
		: never;

type CatalogRuleEntry<TCatalog, TIdentity> = TCatalog extends PermissionCatalog<
	infer TName,
	infer _TTree
>
	? { [TKey in TName]: RuleTree<TCatalog, TIdentity> }
	: never;

type UnionToIntersection<T> = (
	T extends unknown
		? (value: T) => void
		: never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never;

type RuleCatalogs<
	TCatalogs extends readonly AnyPermissionCatalog[],
	TIdentity,
> = UnionToIntersection<CatalogRuleEntry<TCatalogs[number], TIdentity>>;

/** The shared, synchronous authorization contract used by client and server. */
export interface Authorization<
	TIdentitySchema extends z.ZodType<{ id: string }, any>,
	TCatalogs extends readonly AnyPermissionCatalog[],
> {
	readonly identitySchema: TIdentitySchema;
	readonly permissions: TCatalogs;
	parseIdentity(identity: unknown): z.output<TIdentitySchema> | null;
	can(
		request: RequestFor<RegisteredDescriptor<TCatalogs>>,
		identity: z.input<TIdentitySchema> | null,
	): boolean;
}

/** Any one-rule authorization contract, for generic adapter APIs. */
export type AnyAuthorization = Authorization<
	z.ZodType<{ id: string }, any>,
	readonly AnyPermissionCatalog[]
>;

/** Infer validated identity output from an authorization contract. */
export type AuthorizationIdentity<TAuthorization> =
	TAuthorization extends Authorization<infer TSchema, any>
		? z.output<TSchema>
		: never;

/** Infer accepted identity input from an authorization contract. */
export type AuthorizationIdentityInput<TAuthorization> =
	TAuthorization extends Authorization<infer TSchema, any>
		? z.input<TSchema>
		: never;

/** Infer registered permission requests from an authorization contract. */
export type AuthorizationPermissionRequest<TAuthorization> =
	TAuthorization extends Authorization<any, infer TCatalogs>
		? RequestFor<RegisteredDescriptor<TCatalogs>>
		: never;

/** Infer stable permission ids registered by an authorization contract. */
export type AuthorizationPermissionId<TAuthorization> =
	TAuthorization extends Authorization<any, infer TCatalogs>
		? RegisteredDescriptor<TCatalogs> extends PermissionDescriptor<
				infer TId,
				any
			>
			? TId
			: never
		: never;

function createRuleTree(tree: object): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(tree)) {
		if (isPermissionDescriptor(value)) {
			result[key] = Object.freeze({
				allow: (): AuthorizationRuleDefinition => ({
					permission: value,
					evaluate: () => true,
				}),
				when: (
					rule: AuthorizationRuleDefinition["evaluate"],
				): AuthorizationRuleDefinition => ({
					permission: value,
					evaluate: rule,
				}),
			});
		} else if (typeof value === "object" && value !== null) {
			result[key] = createRuleTree(value);
		}
	}
	return result;
}

/**
 * Define one browser-safe rule set over a validated identity and registered
 * permission catalogs. Missing rules deny; rule failures are allowed to
 * propagate so outages never masquerade as ordinary denials.
 */
export function defineAuthorization<
	const TIdentitySchema extends z.ZodType<{ id: string }, any>,
	const TCatalogs extends readonly AnyPermissionCatalog[],
>(config: {
	identity: TIdentitySchema;
	permissions: TCatalogs;
	rules: (
		permissions: RuleCatalogs<TCatalogs, z.output<TIdentitySchema>>,
	) => readonly AuthorizationRuleDefinition[];
}): Authorization<TIdentitySchema, TCatalogs> {
	const descriptors = new Map<string, AnyPermissionDescriptor>();
	const ruleCatalogs: Record<string, unknown> = {};

	for (const catalog of config.permissions) {
		const name = catalog[permissionCatalogMarker].name;
		if (name in ruleCatalogs) {
			throw new TypeError(`Permission catalog "${name}" is registered twice.`);
		}
		ruleCatalogs[name] = createRuleTree(catalog);

		const collect = (tree: object) => {
			for (const value of Object.values(tree)) {
				if (isPermissionDescriptor(value)) {
					if (descriptors.has(value.id)) {
						throw new TypeError(
							`Permission "${value.id}" is registered twice.`,
						);
					}
					descriptors.set(value.id, value);
				} else if (typeof value === "object" && value !== null) {
					collect(value);
				}
			}
		};
		collect(catalog);
	}

	const rules = new Map<string, AuthorizationRuleDefinition["evaluate"]>();
	for (const definition of config.rules(
		ruleCatalogs as RuleCatalogs<TCatalogs, z.output<TIdentitySchema>>,
	)) {
		if (!descriptors.has(definition.permission.id)) {
			throw new TypeError(
				`Permission "${definition.permission.id}" is not registered.`,
			);
		}
		if (rules.has(definition.permission.id)) {
			throw new TypeError(
				`Permission "${definition.permission.id}" has more than one rule.`,
			);
		}
		rules.set(definition.permission.id, definition.evaluate);
	}

	return Object.freeze({
		identitySchema: config.identity,
		permissions: config.permissions,
		parseIdentity(identity: unknown) {
			return identity === null ? null : config.identity.parse(identity);
		},
		can(request: AnyPermissionRequest, identity: unknown) {
			const candidate = request;
			const descriptor = descriptors.get(candidate.id);
			if (!descriptor) {
				throw new TypeError(`Permission "${candidate.id}" is not registered.`);
			}

			const parsedIdentity =
				identity === null ? null : config.identity.parse(identity);
			const parsedFacts = descriptor.schema
				? descriptor.schema.parse(candidate.facts)
				: undefined;
			const rule = rules.get(candidate.id);
			if (!rule) return false;

			const result = rule({
				identity: parsedIdentity,
				facts: parsedFacts,
			});
			if (typeof result !== "boolean") {
				throw new TypeError(
					`Authorization rule for "${candidate.id}" must return a boolean.`,
				);
			}
			return result;
		},
	}) as Authorization<TIdentitySchema, TCatalogs>;
}

/** Check whether a runtime value has the shape of a permission request. */
export function isPermissionRequest(
	value: unknown,
): value is AnyPermissionRequest {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as AnyPermissionRequest).id === "string" &&
		isPermissionDescriptor((value as AnyPermissionRequest).permission)
	);
}
