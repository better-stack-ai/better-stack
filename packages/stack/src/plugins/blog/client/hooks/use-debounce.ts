import { throttle } from "../../utils";
import { useEffect, useMemo, useRef, useState } from "react";

// Re-export the shared core hook — never copy it into a plugin.
export { useDebounce } from "@btst/stack/plugins/client/hooks";

export function useThrottle<T>(value: T, wait?: number): T {
	const [throttledValue, setThrottledValue] = useState<T>(value);
	const valueRef = useRef(value);

	valueRef.current = value;

	const throttledSetter = useMemo(() => {
		return throttle((next: T) => {
			setThrottledValue(next);
		}, wait ?? 500);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wait]);

	useEffect(() => {
		throttledSetter(valueRef.current);
		return () => {
			throttledSetter.cancel();
		};
	}, [throttledSetter]);

	useEffect(() => {
		throttledSetter(value);
	}, [value, throttledSetter]);

	return throttledValue;
}
