"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { GeneratedWork, UserContext } from "./types";
import { contextKey, historyKey, saveGeneratedHistory, saveUserContexts } from "./storage";
import { defaultGeneratedWorks, defaultUserContexts } from "./workos-data";

const contextChangedEvent = "hyunwoo-workos:user-contexts-changed";
const historyChangedEvent = "hyunwoo-workos:generated-history-changed";

export function useUserContexts() {
  const snapshot = useSyncExternalStore(
    subscribeToStore(contextChangedEvent),
    () => getSnapshot(contextKey, defaultUserContexts),
    () => JSON.stringify(defaultUserContexts),
  );
  const contexts = useMemo(() => parseSnapshot<UserContext[]>(snapshot, defaultUserContexts), [snapshot]);

  function persist(nextContexts: UserContext[]) {
    saveUserContexts(nextContexts);
    emitStoreChange(contextChangedEvent);
  }

  return [contexts, persist] as const;
}

export function useGeneratedHistory() {
  const snapshot = useSyncExternalStore(
    subscribeToStore(historyChangedEvent),
    () => getSnapshot(historyKey, defaultGeneratedWorks),
    () => JSON.stringify(defaultGeneratedWorks),
  );
  const history = useMemo(() => parseSnapshot<GeneratedWork[]>(snapshot, defaultGeneratedWorks), [snapshot]);

  function persist(nextHistory: GeneratedWork[]) {
    saveGeneratedHistory(nextHistory);
    emitStoreChange(historyChangedEvent);
  }

  return [history, persist] as const;
}

function subscribeToStore(eventName: string) {
  return (callback: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const handler = () => callback();
    window.addEventListener(eventName, handler);
    window.addEventListener("storage", handler);

    return () => {
      window.removeEventListener(eventName, handler);
      window.removeEventListener("storage", handler);
    };
  };
}

function getSnapshot(key: string, fallback: unknown) {
  if (typeof window === "undefined") {
    return JSON.stringify(fallback);
  }

  return window.localStorage.getItem(key) ?? JSON.stringify(fallback);
}

function parseSnapshot<T>(snapshot: string, fallback: T): T {
  try {
    return JSON.parse(snapshot) as T;
  } catch {
    return fallback;
  }
}

function emitStoreChange(eventName: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(eventName));
}
