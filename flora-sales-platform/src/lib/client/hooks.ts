"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Meta } from "./types";

export function useFetch<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, loading, reload };
}

let metaCache: Meta | null = null;
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(metaCache);
  useEffect(() => {
    if (metaCache) return;
    api<Meta>("/api/meta").then((m) => {
      metaCache = m;
      setMeta(m);
    });
  }, []);
  return meta;
}
