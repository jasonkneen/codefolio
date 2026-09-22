import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useFolioStore } from '@/lib/notebook/store';
import { cellKindLabel, referenceLabel, referenceTarget } from '@/lib/notebook/cell-references';
import type { Cell } from '@/lib/notebook/types';

export function CellBinding({ nodeId, cell }: { nodeId: string; cell: Cell }) {
  const nodes = useFolioStore(s => s.nodes);
  const rename = useFolioStore(s => s.setCellName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cell.name ?? '');
  const [error, setError] = useState('');
  const cancel = useRef(false);
  useEffect(() => { setDraft(cell.name ?? ''); }, [cell.name]);
  const node = nodes.find(n => n.id === nodeId)!;
  const label = `@${node.data.ref}.${cell.name}`;
  const refs = Object.values(cell.references ?? {});
  return <>
    <div className="folio-cell-binding nodrag nopan">
      <span>{cellKindLabel[cell.kind]}</span>
      {editing ? <input aria-label="Cell variable name" autoFocus value={draft} maxLength={80} spellCheck={false} onChange={e => { setDraft(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); } }} onBlur={() => {
        if (cancel.current) { cancel.current = false; setDraft(cell.name ?? ''); setEditing(false); return; }
        if (rename(nodeId, cell.id, draft)) { setEditing(false); setError(''); }
        else setError('Use a unique variable name: letters, numbers, or underscores.');
      }} /> : <button type="button" className="folio-cell-name" aria-label={`Rename ${cell.name}`} title={label} onClick={() => setEditing(true)}>@{cell.name}</button>}
      {cell.stale && cell.kind === 'code' && <span className="folio-inputs-changed">Inputs changed · Run</span>}
    </div>
    {error && <p className="folio-binding-error" role="alert">{error}</p>}
    {!!refs.length && <div className="folio-cell-dependencies nodrag nopan" aria-label="Cell sources">{refs.map((ref, i) => {
      const target = referenceTarget(nodes, ref);
      return <button type="button" key={i} disabled={!target} onClick={() => useFolioStore.getState().setFocused(ref.nodeId)} title="Go to source notebook"><ArrowUpRight size={12} />{referenceLabel(nodes, ref)}{target?.cell.stale ? ' · Inputs changed' : ''}</button>;
    })}</div>}
  </>;
}
