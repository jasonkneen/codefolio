import * as Y from "yjs";
/** Store the CRDT itself, including offline updates, rather than only its rendered desk. */
export async function persistDocument(doc: Y.Doc, key: string, factory = globalThis.indexedDB) {
  if (!factory) return { stop: () => {}, loaded: false };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("codefolio-sync-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  let loaded = false;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("documents", "readonly"); const request = transaction.objectStore("documents").get(key);
    request.onsuccess = () => { try { if (request.result) { Y.applyUpdate(doc, new Uint8Array(request.result)); loaded = true; } } catch (error) { transaction.abort(); reject(error); } };
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
  const save = () => {
    const transaction = db.transaction("documents", "readwrite");
    const store = transaction.objectStore("documents");
    const snapshot = Y.encodeStateAsUpdate(doc);
    const request = store.get(key);
    request.onsuccess = () => {
      const merged = new Y.Doc();
      if (request.result) Y.applyUpdate(merged, new Uint8Array(request.result));
      Y.applyUpdate(merged, snapshot); store.put(Y.encodeStateAsUpdate(merged), key); merged.destroy();
    };
  };
  doc.on("update", save);
  if (!loaded) save();
  return { loaded, stop: () => { doc.off("update", save); db.close(); } };
}
