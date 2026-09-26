import { useFolioStore } from "@/lib/notebook/store";
import { useCollaboration } from "@/lib/collaboration/client";
import { useProductPanels } from "@/lib/ai/ui";
export function LivePresence({ nodeId }: { nodeId: string }) {
  const cells = useFolioStore(s => s.nodes.find(n => n.id === nodeId)?.data.cells);
  const peers = useCollaboration(s => s.peers);
  const agent = useProductPanels(s => s.activity);
  const agents = [...peers.flatMap(peer => peer.agent ? [{ ...peer.agent, key: String(peer.id) }] : []), ...(agent ? [{ ...agent, key: "local" }] : [])].filter(a => a.nodeId === nodeId || a.nodeId === "*");
  return <>
    <div className="folio-live-names">{peers.filter(p => p.nodeId === nodeId || p.pointer?.nodeId === nodeId || p.selection?.nodeId === nodeId).map(p => <span key={p.id} style={{ borderColor: p.color }}>{p.name}</span>)}{agents.map(a => <span key={a.key} className="folio-agent-presence">{a.name} · {a.action}{a.cellId ? ` · @${cells?.find(c => c.id === a.cellId)?.name || "cell"}` : ""}</span>)}</div>
    {peers.filter(p => p.pointer?.nodeId === nodeId).map(p => <div key={p.id} className="folio-remote-pointer" style={{ left: `${p.pointer!.x * 100}%`, top: `${p.pointer!.y * 100}%`, color: p.color }}><svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1L1 16L5 12L8 19L11 17L8 11L15 11Z" fill="currentColor" stroke="white" /></svg><span style={{ background: p.color }}>{p.name}</span></div>)}
  </>;
}

export function AgentCellPresence({ nodeId, cellId }: { nodeId: string; cellId: string }) {
  const peers = useCollaboration(s => s.peers);
  const local = useProductPanels(s => s.activity);
  const agents = [...peers.flatMap(peer => peer.agent ? [{ ...peer.agent, key: String(peer.id) }] : []), ...(local ? [{ ...local, key: "local" }] : [])].filter(a => a.nodeId === nodeId && a.cellId === cellId);
  return <>{agents.map(agent => <div key={agent.key} className="folio-agent-cursor" role="status"><svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1L1 16L5 12L8 19L11 17L8 11L15 11Z" fill="currentColor" stroke="white" /></svg><span>{agent.name} · {agent.action}</span></div>)}</>;
}
