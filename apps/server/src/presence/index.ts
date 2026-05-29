import { createMemoryPresenceStore, type PresenceStore } from './store.js';

let store: PresenceStore | null = null;

export function getPresenceStore(): PresenceStore {
  if (!store) store = createMemoryPresenceStore();
  return store;
}

/** Test-only: swap the backing store. */
export function _setPresenceStore(s: PresenceStore): void {
  store = s;
}

export type { PresenceStore, PresenceState } from './store.js';
