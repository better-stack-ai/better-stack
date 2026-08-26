import { z } from "zod";

const permissionSeedMarker = Symbol("btst.permission-seed");
const permissionDescriptorMarker = Symbol("btst.permission-descriptor");
const permissionCatalogMarker = Symbol("btst.permission-catalog");
declare const authorizationContractTypes: unique symbol;

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

/**
 * A rule-free authorization vocabulary that can be published independently of
 * an application's backend implementation.
 */
export interface AuthorizationContract<
	TIdentitySchema extends z.ZodType<{ id: string }, any>,
	TCatalogs extends readonly AnyPermissionCatalog[],
> {
	readonly [authorizationContractTypes]?: {
		readonly identity: z.output<TIdentitySchema>;
		readonly identityInput: z.input<TIdentitySchema>;
		readonly permission: RequestFor<RegisteredDescriptor<TCatalogs>>;
	};
	readonly identitySchema: TIdentitySchema;
	readonly permissions: TCatalogs;
	readonly permissionIds: readonly string[];
	readonly version: string;
	parseIdentity(identity: unknown): z.output<TIdentitySchema> | null;
	parsePermission(
		permission: unknown,
	): RequestFor<RegisteredDescriptor<TCatalogs>>;
}

/** Any portable authorization contract, for generic adapter APIs. */
export interface AnyAuthorizationContract {
	readonly [authorizationContractTypes]?: {
		readonly identity: { id: string };
		readonly identityInput: unknown;
		readonly permission: any;
	};
	readonly identitySchema: z.ZodType<{ id: string }, any>;
	readonly permissions: readonly AnyPermissionCatalog[];
	readonly permissionIds: readonly string[];
	readonly version: string;
	parseIdentity(identity: unknown): { id: string } | null;
	parsePermission(permission: unknown): any;
}

type ContractIdentitySchema<TContract extends AnyAuthorizationContract> =
	TContract extends AuthorizationContract<infer TSchema, any> ? TSchema : never;

type ContractCatalogs<TContract extends AnyAuthorizationContract> =
	TContract extends AuthorizationContract<any, infer TCatalogs>
		? TCatalogs
		: never;

/** Infer validated identity output from a portable contract. */
export type AuthorizationContractIdentity<TContract> =
	TContract extends AnyAuthorizationContract
		? NonNullable<TContract[typeof authorizationContractTypes]>["identity"]
		: never;

/** Infer accepted identity input from a portable contract. */
export type AuthorizationContractIdentityInput<TContract> =
	TContract extends AnyAuthorizationContract
		? NonNullable<TContract[typeof authorizationContractTypes]>["identityInput"]
		: never;

/** Infer registered permission requests from a portable contract. */
export type AuthorizationContractPermissionRequest<TContract> =
	TContract extends AnyAuthorizationContract
		? NonNullable<TContract[typeof authorizationContractTypes]>["permission"]
		: never;

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function fingerprint(value: string): string {
	let hash = 0xcbf29ce484222325n;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= BigInt(value.charCodeAt(index));
		hash = BigInt.asUintN(64, hash * 0x100000001b3n);
	}
	return hash.toString(16).padStart(16, "0");
}

const unsupportedPortableSchemaMessage =
	"Authorization contract schemas must be fully representable as JSON Schema; custom refinements, transforms, and other opaque behavior are unsupported because they cannot be derived into a stable version.";

function inspectPortableSchema(
	schema: z.core.$ZodType,
	jsonSchema: Record<string, unknown>,
): boolean {
	// Zod Core exposes `def` as its schema traversal representation, and Zod's
	// own JSON Schema converter consumes the same definitions. Keep that
	// version-sensitive boundary centralized here and covered through the public
	// contract API.
	const definition = schema._zod.def;
	if (definition.type === "object") {
		const catchall = (definition as z.core.$ZodObjectDef).catchall;
		jsonSchema["x-btst-object-mode"] = !catchall
			? "strip"
			: catchall._zod.def.type === "never"
				? "strict"
				: catchall._zod.def.type === "unknown"
					? "passthrough"
					: "catchall";
	}

	if (
		("coerce" in definition && definition.coerce === true) ||
		definition.type === "custom" ||
		definition.type === "transform" ||
		definition.type === "pipe" ||
		definition.type === "catch" ||
		definition.type === "default" ||
		definition.type === "prefault"
	) {
		return true;
	}

	return (
		definition.checks?.some((check) => {
			const checkDefinition = check._zod.def as z.core.$ZodCheckDef & {
				format?: string;
				pattern?: RegExp;
				type?: string;
			};
			return (
				checkDefinition.check === "custom" ||
				checkDefinition.check === "overwrite" ||
				checkDefinition.type === "custom" ||
				(checkDefinition.format === "regex" &&
					checkDefinition.pattern instanceof RegExp &&
					checkDefinition.pattern.flags.length > 0)
			);
		}) === true
	);
}

function toPortableJsonSchema(schema: z.ZodType): unknown {
	let containsOpaqueCheck = false;
	try {
		const jsonSchema = z.toJSONSchema(schema, {
			override: ({ zodSchema, jsonSchema }) => {
				if (inspectPortableSchema(zodSchema, jsonSchema)) {
					containsOpaqueCheck = true;
				}
			},
		});
		if (containsOpaqueCheck) {
			throw new TypeError(unsupportedPortableSchemaMessage);
		}
		return jsonSchema;
	} catch (error) {
		if (
			error instanceof TypeError &&
			error.message === unsupportedPortableSchemaMessage
		) {
			throw error;
		}
		throw new TypeError(unsupportedPortableSchemaMessage, { cause: error });
	}
}

function collectDescriptors(
	catalogs: readonly AnyPermissionCatalog[],
): Map<string, AnyPermissionDescriptor> {
	const descriptors = new Map<string, AnyPermissionDescriptor>();
	const collect = (tree: object) => {
		for (const value of Object.values(tree)) {
			if (isPermissionDescriptor(value)) {
				if (descriptors.has(value.id)) {
					throw new TypeError(`Permission "${value.id}" is registered twice.`);
				}
				descriptors.set(value.id, value);
			} else if (typeof value === "object" && value !== null) {
				collect(value);
			}
		}
	};
	for (const catalog of catalogs) collect(catalog);
	return descriptors;
}

/** Define a versioned identity and permission vocabulary without any rules. */
export function defineAuthorizationContract<
	const TIdentitySchema extends z.ZodType<{ id: string }, any>,
	const TCatalogs extends readonly AnyPermissionCatalog[],
>(config: {
	identity: TIdentitySchema;
	permissions: TCatalogs;
}): AuthorizationContract<TIdentitySchema, TCatalogs> {
	const permissions = Object.freeze([
		...config.permissions,
	]) as unknown as TCatalogs;
	const descriptors = collectDescriptors(permissions);
	const permissionIds = Object.freeze([...descriptors.keys()].sort());
	const versionSource = stableJson({
		identity: toPortableJsonSchema(config.identity),
		permissions: permissionIds.map((id) => {
			const descriptor = descriptors.get(id);
			return {
				id,
				facts: descriptor?.schema
					? toPortableJsonSchema(descriptor.schema)
					: null,
			};
		}),
	});

	return Object.freeze({
		identitySchema: config.identity,
		permissions,
		permissionIds,
		version: `auth_${fingerprint(versionSource)}`,
		parseIdentity(identity: unknown) {
			return identity === null ? null : config.identity.parse(identity);
		},
		parsePermission(permissionRequest: unknown) {
			if (
				typeof permissionRequest !== "object" ||
				permissionRequest === null ||
				typeof (permissionRequest as { id?: unknown }).id !== "string"
			) {
				throw new TypeError("A permission request must contain a string id.");
			}
			const candidate = permissionRequest as { id: string; facts?: unknown };
			const descriptor = descriptors.get(candidate.id);
			if (!descriptor) {
				throw new TypeError(`Permission "${candidate.id}" is not registered.`);
			}
			if (!descriptor.schema && candidate.facts !== undefined) {
				throw new TypeError(
					`Permission "${candidate.id}" does not accept facts.`,
				);
			}
			return (
				descriptor.schema ? descriptor(candidate.facts) : descriptor()
			) as RequestFor<RegisteredDescriptor<TCatalogs>>;
		},
	});
}

/** The shared, synchronous authorization contract used by client and server. */
export interface Authorization<
	TIdentitySchema extends z.ZodType<{ id: string }, any>,
	TCatalogs extends readonly AnyPermissionCatalog[],
> {
	readonly contract: AuthorizationContract<TIdentitySchema, TCatalogs>;
	readonly identitySchema: TIdentitySchema;
	readonly permissions: TCatalogs;
	parseIdentity(identity: unknown): z.output<TIdentitySchema> | null;
	can(
		request: RequestFor<RegisteredDescriptor<TCatalogs>>,
		identity: z.input<TIdentitySchema> | null,
	): boolean;
}

/** Any one-rule authorization contract, for generic adapter APIs. */
export interface AnyAuthorization {
	readonly contract: AnyAuthorizationContract;
	readonly identitySchema: z.ZodType<{ id: string }, any>;
	readonly permissions: readonly AnyPermissionCatalog[];
	parseIdentity(identity: unknown): { id: string } | null;
	can(request: any, identity: any): boolean;
}

/** Infer validated identity output from an authorization contract. */
export type AuthorizationIdentity<TAuthorization> = TAuthorization extends {
	readonly identitySchema: infer TSchema extends z.ZodType<{ id: string }, any>;
}
	? z.output<TSchema>
	: never;

/** Infer accepted identity input from an authorization contract. */
export type AuthorizationIdentityInput<TAuthorization> =
	TAuthorization extends {
		readonly identitySchema: infer TSchema extends z.ZodType<
			{ id: string },
			any
		>;
	}
		? z.input<TSchema>
		: never;

/** Infer registered permission requests from an authorization contract. */
export type AuthorizationPermissionRequest<TAuthorization> =
	TAuthorization extends {
		readonly permissions: infer TCatalogs extends
			readonly AnyPermissionCatalog[];
	}
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
	const TContract extends AnyAuthorizationContract,
>(config: {
	contract: TContract;
	rules: (
		permissions: RuleCatalogs<
			ContractCatalogs<TContract>,
			z.output<ContractIdentitySchema<TContract>>
		>,
	) => readonly AuthorizationRuleDefinition[];
}): Authorization<
	ContractIdentitySchema<TContract>,
	ContractCatalogs<TContract>
>;
export function defineAuthorization<
	const TIdentitySchema extends z.ZodType<{ id: string }, any>,
	const TCatalogs extends readonly AnyPermissionCatalog[],
>(config: {
	identity: TIdentitySchema;
	permissions: TCatalogs;
	rules: (
		permissions: RuleCatalogs<TCatalogs, z.output<TIdentitySchema>>,
	) => readonly AuthorizationRuleDefinition[];
}): Authorization<TIdentitySchema, TCatalogs>;
export function defineAuthorization(config: any): any {
	const contractValue: unknown =
		config.contract ??
		(
			defineAuthorizationContract as (input: {
				identity: z.ZodType<{ id: string }, any>;
				permissions: readonly AnyPermissionCatalog[];
			}) => unknown
		)({
			identity: config.identity,
			permissions: config.permissions,
		});
	const contract = contractValue as {
		identitySchema: z.ZodType<{ id: string }, any>;
		permissions: readonly AnyPermissionCatalog[];
		parseIdentity: (value: unknown) => { id: string } | null;
		parsePermission: (value: unknown) => AnyPermissionRequest;
	};
	const descriptors = collectDescriptors(contract.permissions);
	const ruleCatalogs: Record<string, unknown> = {};

	for (const catalog of contract.permissions) {
		const name = catalog[permissionCatalogMarker].name;
		if (name in ruleCatalogs) {
			throw new TypeError(`Permission catalog "${name}" is registered twice.`);
		}
		ruleCatalogs[name] = createRuleTree(catalog);
	}

	const rules = new Map<string, AuthorizationRuleDefinition["evaluate"]>();
	for (const definition of config.rules(ruleCatalogs)) {
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
		contract: contractValue as object,
		identitySchema: contract.identitySchema,
		permissions: contract.permissions,
		parseIdentity(identity: unknown) {
			return contract.parseIdentity(identity);
		},
		can(request: AnyPermissionRequest, identity: unknown) {
			const candidate = contract.parsePermission(request);
			const parsedIdentity = contract.parseIdentity(identity);
			const rule = rules.get(candidate.id);
			if (!rule) return false;

			const result = rule({
				identity: parsedIdentity,
				facts: candidate.facts,
			});
			if (typeof result !== "boolean") {
				throw new TypeError(
					`Authorization rule for "${candidate.id}" must return a boolean.`,
				);
			}
			return result;
		},
	});
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
