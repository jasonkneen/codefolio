import { create } from "zustand";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { FolioEdge, FolioNode } from "./types";
import { parseFolioExport } from "./io";

type Desk = { nodes: FolioNode[]; edges: FolioEdge[] };
export type SaveStatus = { state: "loading" | "saving" | "saved" | "error"; message: string; recoveryAvailable: boolean; conflict?: boolean };
export const useSaveStatus = create<SaveStatus>(() => ({ state: "loading", message: "Opening desk", recoveryAvailable: false }));

export function createDeskStorage(options: {
  indexedDB: () => IDBFactory;
  legacy: () => string | null;
  status: (status: SaveStatus) => void;
  name?: string;
  delay?: number;
  maxDelay?: number;
}) {
  let database: Promise<IDBDatabase> | undefined;
  let writable = false;
  let revision: string | null = null;
  let conflict = false;
  let replace = false;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let recovery: unknown;
  let pending: StorageValue<Desk> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> | undefined;
  let lastState: Desk | undefined;
  let currentKey = "current";
  const status = (state: SaveStatus["state"], message: string) => options.status({ state, message, recoveryAvailable: recovery !== undefined, conflict });
  const open = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = options.indexedDB().open(options.name ?? "folio-desks-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("desks");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => status("error", "Close other Codefolio tabs so this desk can open.");
  }).catch((error) => { database = undefined; throw error; });
  const read = async () => {
    const db = await open();
    const key = currentKey;
    return new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction("desks", "readonly");
      const request = transaction.objectStore("desks").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  const write = async (value: StorageValue<Desk>) => {
    const db = await open();
    const key = currentKey;
    const nextRevision = crypto.randomUUID();
    const force = replace;
    replace = false;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("desks", "readwrite");
      const store = transaction.objectStore("desks");
      let failure: unknown;
      const request = store.get(key);
      request.onsuccess = () => {
        const savedRevision = typeof request.result?.revision === "string" ? request.result.revision : null;
        if (!force && savedRevision !== revision) {
          conflict = true;
          failure = new Error("Desk changed in another tab");
          transaction.abort();
          return;
        }
        try { store.put({ ...value, revision: nextRevision }, key); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => { revision = nextRevision; conflict = false; resolve(); };
      transaction.onerror = () => reject(failure ?? transaction.error);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Save cancelled"));
    });
  };
  const flush = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    clearTimeout(maxTimer); maxTimer = undefined;
    if (writing) { await writing; if (pending && writable) return flush(); return; }
    if (!pending || !writable || conflict) return;
    const value = pending;
    pending = undefined;
    writing = (async () => {
      try {
        await write(value);
        if (!pending) status("saved", "Saved in this browser");
      } catch (error) {
        if (error instanceof DOMException && error.name === "InvalidStateError") database = undefined;
        pending ??= value;
        status("error", conflict ? "Another tab saved a newer desk. Your edits are kept here. Choose which version to keep, or export your edits first." : "Changes are not saved. Free browser storage, then retry, or export this desk.");
      }
    })();
    await writing;
    writing = undefined;
    // A newer write is scheduled separately; failed values wait for Retry or an edit.
  };
  const storage: PersistStorage<Desk> = {
    getItem: async () => {
      status("loading", "Opening desk");
      writable = false;
      try {
        let raw = await read();
        revision = raw && typeof raw === "object" && "revision" in raw && typeof raw.revision === "string" ? raw.revision : null;
        conflict = false;
        if (raw === undefined) {
          const legacy = currentKey === "current" ? options.legacy() : null;
          if (legacy) {
            recovery = legacy;
            raw = JSON.parse(legacy);
          }
        } else recovery = raw;
        if (raw === undefined) {
          writable = true;
          status("saved", "Saved in this browser");
          return null;
        }
        const envelope = raw as { state?: unknown; version?: unknown };
        if (!envelope || typeof envelope !== "object" || (envelope.version !== undefined && envelope.version !== 0)) throw new Error("Unknown save version");
        const parsed = parseFolioExport(envelope.state);
        if (!parsed) throw new Error("Invalid saved desk");
        writable = true;
        recovery = undefined;
        lastState = parsed;
        status("saved", "Saved in this browser");
        return { state: parsed, version: 0 };
      } catch {
        status("error", "The saved desk could not be opened. Its stored copy has been left untouched. Retry or import a desk to replace it.");
        return null;
      }
    },
    setItem: (_name, value) => {
      if (!writable) return;
      if (lastState?.nodes === value.state.nodes && lastState?.edges === value.state.edges) return;
      lastState = value.state;
      pending = value;
      if (conflict) return;
      status("saving", "Saving changes");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, options.delay ?? 250);
      maxTimer ??= setTimeout(() => { void flush(); }, options.maxDelay ?? 2000);
    },
    removeItem: async () => { throw new Error("Use Import desk or Restore starters to replace a saved desk."); },
  };
  return {
    storage, flush,
    setInitialKey: (key: string) => { currentKey = key; },
    selectKey: async (key: string) => {
      await flush();
      if (pending || writing) throw Error("This workspace has unsaved changes. Retry saving or export it before switching.");
      currentKey = key;
      writable = false; revision = null; conflict = false; replace = false;
      recovery = undefined; lastState = undefined;
      status("loading", "Opening workspace");
    },
    deleteKey: async (key: string) => {
      if (key === currentKey) throw Error("Switch to another workspace before removing this one.");
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("desks", "readwrite");
        transaction.objectStore("desks").delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    allowReplacement: () => { writable = true; lastState = undefined; conflict = false; replace = true; },
    discardChanges: () => {
      clearTimeout(timer); clearTimeout(maxTimer); timer = undefined; maxTimer = undefined;
      pending = undefined; lastState = undefined; writable = false; conflict = false;
    },
    hasUnsavedChanges: () => Boolean(pending || writing),
    recoveryText: () => typeof recovery === "string" ? recovery : JSON.stringify(recovery, null, 2),
    close: async () => { await flush(); (await database)?.close(); database = undefined; },
  };
}

export const deskStorage = createDeskStorage({
  indexedDB: () => indexedDB,
  legacy: () => localStorage.getItem("folio-canvas-v2"),
  status: (status) => useSaveStatus.setState(status),
});
