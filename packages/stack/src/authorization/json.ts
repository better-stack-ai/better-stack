export function assertJsonSafe(
	value: unknown,
	ancestors = new Set<object>(),
): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (Number.isFinite(value)) return;
		throw new TypeError("Authorization values must be finite numbers.");
	}
	if (typeof value !== "object") {
		throw new TypeError("Authorization values must be JSON-safe.");
	}
	if (ancestors.has(value)) {
		throw new TypeError("Authorization values cannot contain cycles.");
	}
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index += 1) {
				if (!(index in value)) {
					throw new TypeError(
						"Authorization arrays cannot contain empty slots.",
					);
				}
				assertJsonSafe(value[index], ancestors);
			}
			for (const key of Reflect.ownKeys(value)) {
				if (
					key !== "length" &&
					(typeof key !== "string" ||
						!/^0$|^[1-9]\d*$/.test(key) ||
						Number(key) >= value.length)
				) {
					throw new TypeError(
						"Authorization arrays cannot contain extra properties.",
					);
				}
			}
			return;
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError(
				"Authorization values must contain only plain objects.",
			);
		}
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (
				typeof key !== "string" ||
				!descriptor?.enumerable ||
				!("value" in descriptor)
			) {
				throw new TypeError(
					"Authorization object properties must be JSON-safe.",
				);
			}
			assertJsonSafe(descriptor.value, ancestors);
		}
	} finally {
		ancestors.delete(value);
	}
}
