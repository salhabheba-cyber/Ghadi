"use client";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

export interface LiveState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/** Subscribes to a Dexie query; re-renders whenever the underlying tables change. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({ data: undefined, loading: true, error: null });
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (data) => setState({ data, loading: false, error: null }),
      error: (e: unknown) =>
        setState({
          data: undefined,
          loading: false,
          error: e instanceof Error ? e.message : "Could not read local data.",
        }),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
