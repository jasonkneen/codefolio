import { useEffect, useState } from "react";
import * as Y from "yjs";
import { useFolioStore } from "@/lib/notebook/store";
import { useWorkspaceStore } from "@/lib/notebook/workspaces";
import { serviceUrl } from "@/lib/ai/client";
import { connectRoom, parseRoomLink, useCollaboration } from "@/lib/collaboration/client";
import { persistDocument } from "@/lib/collaboration/local-document";
import { deskDocument, writeDesk } from "@/lib/collaboration/document";
export function RemoteWorkspace() {
  const id = useWorkspaceStore(s => s.activeId);
  const hydrated = useFolioStore(s => s.hydrated);
  const status = useCollaboration(s => s.status);
  const link = useCollaboration(s => s.link);
  const [online, setOnline] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setOnline(navigator.onLine); const retry = () => { setOnline(true); setAttempt(a => a + 1); }; const offline = () => setOnline(false); window.addEventListener("online", retry); window.addEventListener("offline", offline); return () => { window.removeEventListener("online", retry); window.removeEventListener("offline", offline); }; }, []);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!hydrated || !import.meta.env.VITE_CODEFOLIO_SERVICE_URL) return;
    const controller = new AbortController(); let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const timer = setTimeout(() => { void (async () => {
      if (useCollaboration.getState().link) return;
      const key = `codefolio-remote:${serviceUrl("/sync")}:${id}`;
      try {
        const provision = async () => {
        setFailure("");
        const raw = localStorage.getItem(key);
        let room = raw ? parseRoomLink(`${location.origin}/#share=${encodeURIComponent(raw)}`) : undefined;
        if (!room) {
          const state = useFolioStore.getState(); const doc = deskDocument({ nodes: state.nodes, edges: state.edges });
          let original = { nodes: state.nodes, edges: state.edges };
          const unsubscribe = useFolioStore.subscribe(current => { const next = { nodes: current.nodes, edges: current.edges }; writeDesk(doc, next, original); original = next; });
          const bytes = Y.encodeStateAsUpdate(doc);
          let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          try {
          const response = await fetch(serviceUrl("/api/rooms"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: btoa(binary) }), signal: controller.signal });
          const body = await response.json(); if (!response.ok) throw Error(body.error || "Remote storage unavailable");
          room = parseRoomLink(`${location.origin}/#share=${encodeURIComponent(JSON.stringify(body))}`);
          if (!room) throw Error("Invalid remote workspace response");
          if (cancelled) return;
          const cache = await persistDocument(doc, `${serviceUrl("/sync")}:${room.room}`); cache.stop();
          localStorage.setItem(key, JSON.stringify(room));
          } finally { unsubscribe(); doc.destroy(); }
        }
        if (!cancelled) await connectRoom(room, localStorage.getItem("codefolio-peer-name") || "Guest");
        };
        if (navigator.locks) await navigator.locks.request(key, { signal: controller.signal }, provision);
        else await provision();
      } catch (error) { if (!cancelled) setFailure(error instanceof Error ? error.message : "Remote storage unavailable"); }
    })(); }, 300);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); clearTimeout(timeout); };
  }, [id, hydrated, attempt]);
  if (!hydrated) return null;
  return <span className="folio-storage-mode" role="status" title={failure || undefined}>{link ? online && status === "connected" ? "Fly storage connected" : "Saved locally · reconnecting to Fly" : failure ? "Fly unavailable · saved locally" : import.meta.env.VITE_CODEFOLIO_SERVICE_URL ? "Connecting Fly storage" : "Local storage"}</span>;
}
