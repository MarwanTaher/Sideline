import { useSyncExternalStore } from "react";

/**
 * Device-local preferences (localStorage) read without a set-state-in-effect
 * round trip. The server render sees `null`; the client reads the real value
 * during hydration and re-renders whenever `writeLocal` (or another tab) changes it.
 */
const CHANGE_EVENT = "sideline:local-storage";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / storage full: the preference simply won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useLocalStorage(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readLocal(key), () => null);
}
