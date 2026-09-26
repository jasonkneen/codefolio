import { updatePresence } from "@/lib/collaboration/client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Send, Settings2, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse, MessageAction, MessageActions } from "@/components/ai-elements/message";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { requestAssistant, serviceUrl } from "@/lib/ai/client";
import { readProposal, type AssistantRequest, type Provider } from "@/lib/ai/protocol";
import { applyProposal } from "@/lib/ai/proposals";
import { useProductPanels } from "@/lib/ai/ui";
import { useFolioStore } from "@/lib/notebook/store";
import { useWorkspaceStore } from "@/lib/notebook/workspaces";
import type { FolioNode } from "@/lib/notebook/types";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; baseline?: FolioNode[]; complete?: boolean; applied?: boolean };
type Endpoint = { id: string; name: string; url: string; model: string };
export function AssistantPanel() {
  const open = useProductPanels(s => s.assistant);
  const draft = useProductPanels(s => s.draft);
  const nodes = useFolioStore(s => s.nodes); const focused = useFolioStore(s => s.focusedNodeId);
  const workspaceId = useWorkspaceStore(s => s.activeId);
  const [provider, setProvider] = useState<Provider>("claude"); const [model, setModel] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]); const [endpointId, setEndpointId] = useState("");
  const [apiKey, setApiKey] = useState(""); const [token, setToken] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [requestActivity, setRequestActivity] = useState<NonNullable<ReturnType<typeof useProductPanels.getState>["activity"]> | null>(null);
  const [contextCell, setContextCell] = useState<string | undefined>();
  const [target, setTarget] = useState(""); const [available, setAvailable] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null); const input = useRef<HTMLTextAreaElement>(null);
  const endpoint = endpoints.find(e => e.id === endpointId);
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem("codefolio-endpoints") || "[]"); if (Array.isArray(value)) setEndpoints(value.filter(e => typeof e.id === "string" && typeof e.name === "string" && typeof e.url === "string" && typeof e.model === "string").slice(0, 20)); } catch { /* Empty settings are valid. */ } }, []);
  useEffect(() => { controller.current?.abort(); setMessages([]); setError(""); setBusy(false); return () => controller.current?.abort(); }, [workspaceId]);
  useEffect(() => { if (focused) setTarget(focused); }, [focused]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus(); const abort = new AbortController();
    void fetch(serviceUrl("/api/assistant/status"), { signal: abort.signal }).then(r => { setAvailable(r.ok); }).catch(() => { if (!abort.signal.aborted) setAvailable(false); });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    window.addEventListener("keydown", escape);
    return () => { abort.abort(); window.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    if (!draft) return;
    setTarget(draft.nodeId); setContextCell(draft.cellId);
    setPrompt(`${draft.prompt}\n\nFocus on cell ${draft.cellId}.`);
    if (draft.provider) { setProvider(draft.provider); setModel(""); setApiKey(""); }
    useProductPanels.setState({ draft: null });
    input.current?.focus();
  }, [draft]);
  useEffect(() => {
    const activity = busy ? requestActivity : null;
    useProductPanels.setState({ activity }); updatePresence("agent", activity);
    return () => { useProductPanels.setState({ activity: null }); updatePresence("agent", null); };
  }, [busy, requestActivity]);
  const close = () => { controller.current?.abort(); useProductPanels.setState({ assistant: false }); };
  const updateEndpoints = (next: Endpoint[]) => { setEndpoints(next); localStorage.setItem("codefolio-endpoints", JSON.stringify(next)); };
  const send = async (text = prompt) => {
    if (!text.trim() || busy) return;
    const snapshot = structuredClone(useFolioStore.getState().nodes);
    const chosen = target ? snapshot.filter(n => n.id === target) : snapshot.slice(0, 20);
    if (!chosen.length) { setError("Add or select a notebook first."); return; }
    let budget = 100_000;
    const baseline = chosen.map(node => ({ ...node, data: { ...node.data, cells: node.data.cells.slice(0, 100).filter(cell => {
      if (cell.source.length > 32_000 || cell.source.length > budget) return false;
      budget -= cell.source.length; return true;
    }) } }));
    const notebooks = baseline.map(n => ({ id: n.id, title: n.data.title, ref: n.data.ref, cells: n.data.cells.map(c => ({ id: c.id, kind: c.kind, source: c.source })) }));
    const history = [...messages.filter(m => m.role === "user" || m.complete).map(m => ({ role: m.role, content: m.content })), { role: "user" as const, content: text.trim() }].slice(-20);
    const id = crypto.randomUUID(); const abort = new AbortController(); controller.current = abort;
    setMessages(current => [...current, { id: crypto.randomUUID(), role: "user", content: text.trim() }, { id, role: "assistant", content: "", baseline }]);
    setRequestActivity({ nodeId: target || "*", cellId: contextCell, name: provider === "claude" ? "Claude" : provider === "codex" ? "Codex" : "Assistant", action: "Working" });
    setPrompt(""); setBusy(true); setError("");
    const request: AssistantRequest = { provider, model: (provider === "custom" ? endpoint?.model : model) || undefined, endpoint: provider === "custom" ? endpoint?.url : undefined, apiKey: apiKey || undefined, messages: history, notebooks };
    try {
      await requestAssistant(request, token, abort.signal, event => {
        if (abort.signal.aborted) return;
        setMessages(current => current.map(m => m.id === id ? event.type === "text" ? { ...m, content: m.content + event.delta } : event.type === "done" ? { ...m, complete: true } : m : m));
      });
    } catch (failure) { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Assistant request failed."); }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false); setRequestActivity(null); } }
  };
  const apply = (message: ChatMessage) => {
    const proposal = readProposal(message.content); if (!proposal || !message.baseline) return;
    try {
      const state = useFolioStore.getState(); const next = applyProposal(state.nodes, proposal, message.baseline);
      const change = proposal.changes[0];
      const activity = change ? { nodeId: change.nodeId, cellId: change.action === "replace" ? change.cellId : change.afterCellId || undefined, name: "Assistant", action: "Applying changes" } : null;
      useProductPanels.setState({ activity }); updatePresence("agent", activity);
      setTimeout(() => { if (useProductPanels.getState().activity === activity) { useProductPanels.setState({ activity: null }); updatePresence("agent", null); } }, 500);
      for (const id of new Set(proposal.changes.map(c => c.nodeId))) state.restart(id);
      useFolioStore.setState({ nodes: next });
      setMessages(current => current.map(m => m.id === message.id ? { ...m, applied: true } : m)); toast("Cell changes applied. Run them when ready.");
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Could not apply the proposal."); }
  };
  if (!open) return null;
  return <aside className="folio-assistant" aria-label="Notebook assistant">
    <div className="folio-panel-heading"><div><p className="folio-help-kicker">Codefolio</p><h2>Notebook assistant</h2></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Assistant settings" aria-expanded={settings} onClick={() => setSettings(v => !v)}><Settings2 /></Button><Button variant="ghost" size="icon" aria-label="Close assistant" onClick={close}><X /></Button></div></div>
    <div className="folio-assistant-controls"><label>Provider<select value={provider} onChange={e => { setProvider(e.target.value as Provider); setApiKey(""); }} disabled={busy}><option value="claude">Claude Agent SDK</option><option value="codex">Codex App Server</option><option value="gateway">Vercel AI Gateway</option><option value="custom">Custom endpoint</option></select></label><label>Context<select value={nodes.some(n => n.id === target) ? target : ""} onChange={e => { setTarget(e.target.value); setContextCell(undefined); }} disabled={busy}><option value="">Desk notebooks</option>{nodes.map(n => <option key={n.id} value={n.id}>{n.data.title}</option>)}</select></label></div>
    {settings && <div className="folio-assistant-settings">
      <p>Claude and Codex use the service’s local login. Gateway and custom endpoints accept your provider credentials. Keys stay in this panel’s memory.</p>
      {provider !== "custom" && <label>Model identifier<input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === "claude" || provider === "codex" ? "Provider default" : "Provider/model"} /></label>}
      {provider === "custom" && <>
        <label>Saved endpoint<select value={endpointId} onChange={e => { setEndpointId(e.target.value); setApiKey(""); }}><option value="">Choose an endpoint</option>{endpoints.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <Button size="sm" variant="outline" disabled={endpoints.length >= 20} onClick={() => { const id = crypto.randomUUID(); updateEndpoints([...endpoints, { id, name: "New endpoint", url: "http://localhost:11434/v1/chat/completions", model: "" }]); setEndpointId(id); }}>Add endpoint</Button>
        {endpoint && <>{(["name", "url", "model"] as const).map(field => <label key={field}>{field === "url" ? "Chat completions URL" : field === "model" ? "Model identifier" : "Endpoint name"}<input value={endpoint[field]} onChange={e => updateEndpoints(endpoints.map(item => item.id === endpointId ? { ...item, [field]: e.target.value } : item))} /></label>)}<Button size="sm" variant="danger" onClick={() => { updateEndpoints(endpoints.filter(e => e.id !== endpointId)); setEndpointId(""); setApiKey(""); }}>Remove endpoint</Button></>}
      </>}
      {(provider === "gateway" || provider === "custom") && <label>Provider API key<input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Use service key if configured" /></label>}
      <label>Assistant service token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Required for a remote service" /></label>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setMessages([]); setError(""); }}>Clear conversation</Button>
    </div>}
    {available === false && <p className="folio-assistant-error" role="status">Assistant service is unavailable. Start Codefolio with npm run dev, or configure its service URL.</p>}
    <Conversation className="min-h-0"><ConversationContent className="folio-assistant-messages">
      {!messages.length && <ConversationEmptyState className="h-auto p-4" title="Work with your notebooks" description="Ask about a cell, repair an error, or draft something new. Changes appear as proposals you can review." />}
      {messages.map(message => {
        const proposal = message.complete ? readProposal(message.content) : undefined;
        return <Message from={message.role} key={message.id}><MessageContent>{message.content ? <MessageResponse>{message.content.replace(/```codefolio\s*\n[\s\S]*?(?:```|$)/g, "")}</MessageResponse> : <p className="text-sm text-muted">Working…</p>}</MessageContent>
          {proposal && <div className="folio-proposal"><h3>{proposal.changes.length} proposed {proposal.changes.length === 1 ? "change" : "changes"}</h3>{proposal.changes.map((change, index) => <details key={index}><summary>{change.action === "replace" ? "Update cell" : `Add ${change.kind} cell`} in {message.baseline?.find(n => n.id === change.nodeId)?.data.title || "notebook"}</summary>{change.action === "replace" && <><p>Current source at request time</p><pre>{message.baseline?.find(n => n.id === change.nodeId)?.data.cells.find(c => c.id === change.cellId)?.source}</pre></>}<p>Proposed source</p><pre>{change.source}</pre></details>)}<Button size="sm" disabled={message.applied || busy} onClick={() => apply(message)}><Check />{message.applied ? "Applied" : "Apply cell changes"}</Button></div>}
          {message.role === "assistant" && message.content && <MessageActions><MessageAction label="Copy response" tooltip="Copy response" onClick={() => { void navigator.clipboard.writeText(message.content).then(() => toast("Response copied")); }}><Copy /></MessageAction>{!message.complete && !busy && <span className="text-xs text-muted">Response stopped</span>}</MessageActions>}
        </Message>;
      })}
    </ConversationContent><ConversationScrollButton /></Conversation>
    {error && <p role="alert" className="folio-assistant-error">{error}</p>}
    {!messages.length && <div className="px-4 pb-2"><Suggestions>{["Explain this notebook", "Find and repair errors", "Add a useful example"].map(suggestion => <Suggestion key={suggestion} suggestion={suggestion} disabled={busy} onClick={value => { void send(value); }} />)}</Suggestions></div>}
    <form className="folio-assistant-compose" onSubmit={e => { e.preventDefault(); void send(); }}><label className="sr-only" htmlFor="assistant-prompt">Message the notebook assistant</label><textarea id="assistant-prompt" ref={input} value={prompt} maxLength={32_000} rows={3} placeholder="Ask about your notebook…" onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><div><span>{busy ? "Generating response" : "Enter to send · Shift+Enter for a new line"}</span>{busy ? <Button type="button" size="sm" variant="outline" onClick={() => controller.current?.abort()}><Square />Stop</Button> : <Button type="submit" size="sm" disabled={!prompt.trim()}><Send />Send</Button>}</div></form>
  </aside>;
}
