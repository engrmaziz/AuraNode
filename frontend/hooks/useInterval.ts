import { useEffect, useRef } from "react";

/**
 * Custom hook for polling — calls `callback` every `delay` milliseconds.
 * Pass `null` as delay to stop the interval.
 * Clears the interval automatically on unmount.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
