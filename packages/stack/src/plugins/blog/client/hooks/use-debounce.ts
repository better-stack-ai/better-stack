import { throttle } from "../../utils";
import { useEffect, useMemo, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay?: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay || 500);

		return () => {
			clearTimeout(timer);
		};
	}, [value, delay]);

	return debouncedValue;
}

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
