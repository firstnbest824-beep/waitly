import type { GeneratedWork, UserContext } from "./types";
import { defaultGeneratedWorks, defaultUserContexts } from "./workos-data";

export const contextKey = "hyunwoo-workos:user-contexts";
export const historyKey = "hyunwoo-workos:generated-history";

export function loadUserContexts(): UserContext[] {
  return readFromStorage(contextKey, defaultUserContexts);
}

export function saveUserContexts(contexts: UserContext[]) {
  writeToStorage(contextKey, contexts);
}

export function loadGeneratedHistory(): GeneratedWork[] {
  return readFromStorage(historyKey, defaultGeneratedWorks);
}

export function saveGeneratedHistory(history: GeneratedWork[]) {
  writeToStorage(historyKey, history);
}

function readFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeToStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}
