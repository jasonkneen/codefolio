import { useId, useState } from 'react';
import { Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { useFolioStore } from '@/lib/notebook/store';
import { referenceLabel, referenceOptions, referenceTarget, validCellName } from '@/lib/notebook/cell-references';
import type { Cell } from '@/lib/notebook/types';
import { Button } from '@/components/ui/button';

export function ArtifactInputs({ nodeId, cell }: { nodeId: string; cell: Cell }) {
  const nodes = useFolioStore(s => s.nodes);
  const setInputs = useFolioStore(s => s.setArtifactInputs);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  const options = referenceOptions(nodes);
  const inputs = cell.inputs ?? [];
  return <div className="folio-artifact-inputs">
    <p>Connect a value, then receive it as a component prop or read <code>inputs.name</code>. Code sources must be run first.</p>
    {inputs.map((input, index) => <div className="folio-input-row" key={index}>
      <code>{input.name}</code><span>←</span><button type="button" className="folio-input-source" disabled={!referenceTarget(nodes, input.reference)} onClick={() => useFolioStore.getState().setFocused(input.reference.nodeId)} title="Go to source notebook">{referenceLabel(nodes, input.reference)}<ArrowUpRight size={12} /></button>
      <button type="button" aria-label={`Remove input ${input.name}`} onClick={() => setInputs(nodeId, cell.id, inputs.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /></button>
    </div>)}
    <form className="folio-input-add" onSubmit={e => {
      e.preventDefault();
      const option = options.find(o => o.label === source.trim());
      if (!validCellName(name.trim()) || ['key', 'ref', 'children'].includes(name.trim()) || inputs.some(i => i.name === name.trim())) { setError('Choose a unique prop name (not key, ref, or children).'); return; }
      if (!option) { setError('Choose a named cell from the suggestions.'); return; }
      if (inputs.length >= 50) { setError('An artifact can have up to 50 inputs.'); return; }
      setInputs(nodeId, cell.id, [...inputs, { name: name.trim(), reference: option.reference }]);
      setName(''); setSource(''); setError('');
    }}>
      <input aria-label="Input name" placeholder="photo" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <input aria-label="Input source" placeholder="@notebook.image1" list={id} value={source} onChange={e => setSource(e.target.value)} />
      <datalist id={id}>{options.map(o => <option key={o.label} value={o.label}>{o.detail}</option>)}</datalist>
      <Button type="submit" variant="outline" size="iconSm" aria-label="Add input" title="Add input"><Plus size={14} aria-hidden="true" /></Button>
    </form>
    {error && <p role="alert" className="folio-binding-error">{error}</p>}
  </div>;
}
