import { useEffect, useMemo, useRef, useState } from 'react';
import { extractSection, sectionEntries } from '../utils/sections.js';

export default function SectionCanvas({ imported, disabled, onBuild, onRepair, onSelect, layout = 'desktop', paired = false }) {
  const entries = useMemo(() => sectionEntries(imported.design), [imported.design]);
  const [selected, setSelected] = useState('root');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [showOriginal, setShowOriginal] = useState(false);
  const reference = imported.design.reference;
  const hasReference = reference?.format === 'png' && typeof reference.image === 'string' && /^[A-Za-z0-9+/=]+$/.test(reference.image);
  const [available, setAvailable] = useState(650);
  const viewport = useRef(null);
  const frame = imported.design.frame;
  const active = entries.find(entry => entry.key === selected) || entries[0];
  const highlight = entries.find(entry => entry.key === hovered) || active;
  const fit = Math.min(1, Math.max(0.02, (available - 32) / frame.width));
  const scale = fit * zoom;
  const candidates = entries.filter(e => e.node.name.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    onSelect?.(extractSection(imported.design, active.path));
  }, [imported.design, selected, onSelect]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const selectAtPoint = event => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    const contains = entry => {
      const [a, b, c, d, e, f] = entry.matrix;
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 0.00001) return false;
      const px = (d * (x - e) - c * (y - f)) / determinant;
      const py = (-b * (x - e) + a * (y - f)) / determinant;
      return px >= 0 && py >= 0 && px <= entry.node.width && py <= entry.node.height;
    };
    // A click chooses the deepest container; Alt+click also selects text/artwork.
    const hits = entries.filter(entry => contains(entry) && (event.altKey || entry.node.children?.length || entry.depth === 0));
    const hit = hits[hits.length - 1];
    if (hit) setSelected(hit.key);
  };
  return <div className="space-y-4">
    {imported.design.issues?.length > 0 && <div role="status" className="border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><p className="font-semibold">Partial design: {imported.design.issues.length} artwork issue{imported.design.issues.length === 1 ? '' : 's'}</p><p className="mt-1">Some artwork is missing from this export. Re-export the frame using the latest plugin. Expand the layer details below to see what needs attention.</p><details className="mt-3"><summary className="cursor-pointer font-medium">Show affected layers</summary><ul className="mt-2 max-h-48 space-y-2 overflow-auto">{imported.design.issues.map((issue, index) => <li key={`${issue.id}-${index}`}><strong>{issue.name}</strong>: {issue.message}</li>)}</ul></details><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onRepair} className="border border-amber-300 bg-white px-3 py-2 font-semibold">Re-export JSON with plugin</button></div></div>}

    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-800">Choose a section to build</h2><p className="mt-1 text-xs text-slate-500">Click a section on the canvas or choose a layer below.</p></div><div className="flex items-center gap-2"><button className="border px-2 py-1 text-xs" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button><button className="text-[11px] text-slate-500" onClick={() => setZoom(1)} title="Reset to fit">{Math.round(scale * 100)}%</button><button className="border px-2 py-1 text-xs" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button></div></div>
    {hasReference && <div className="flex items-center gap-2 text-xs" role="group" aria-label="Compare with Figma"><button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)} className="border px-3 py-2">Generated HTML</button><button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)} className="border px-3 py-2">Figma original</button><span className="text-slate-500">Original is for comparison; your build uses editable layers.</span></div>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
      <div className="min-w-0 border border-slate-200 bg-slate-50/60 p-2"><input aria-label="Search design layers" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a section…" className="mb-2 w-full border border-slate-200 bg-white px-2.5 py-2 text-xs"/><div className="max-h-40 space-y-0.5 lg:max-h-[480px] overflow-auto" role="group" aria-label="Design layers">{candidates.map(entry => <button key={entry.key} disabled={disabled} aria-pressed={active.key === entry.key} onClick={() => setSelected(entry.key)} onMouseEnter={() => setHovered(entry.key)} onMouseLeave={() => setHovered(null)} className={`block w-full truncate py-2 pr-2 text-left text-[11px] transition ${active.key === entry.key ? 'bg-violet-100 font-semibold text-violet-800' : 'text-slate-600 hover:bg-white'}`} style={{ paddingLeft: 8 + Math.min(entry.depth, 6) * 10 }} title={`${entry.node.name} · ${entry.node.type}`}>{entry.depth === 0 ? '▣ ' : entry.node.children?.length ? '▧ ' : entry.node.type === 'TEXT' ? 'T ' : '◇ '}{entry.node.name}</button>)}{!candidates.length && <p className="p-3 text-xs text-slate-500">No matching layers.</p>}</div></div>
      <div ref={viewport} className="empty-canvas min-w-0 overflow-auto border border-slate-200 p-4" style={{ maxHeight: 540 }}>
        <div className="relative mx-auto bg-white shadow-lg" style={{ width: frame.width * scale, height: frame.height * scale }}>
          {showOriginal && hasReference ? <img alt="Figma original reference" src={`data:image/png;base64,${reference.image}`} className="pointer-events-none absolute left-0 top-0 max-w-none" style={{ width: frame.width * scale, height: frame.height * scale }}/> : <iframe title="Uploaded Figma design" srcDoc={imported.preview} sandbox="allow-scripts" tabIndex={-1} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}/> }
          <div role="img" aria-label="Click a design section to select it" onClick={selectAtPoint} className={`absolute inset-0 ${disabled ? '' : 'cursor-crosshair'}`}>
            {highlight && <div className="pointer-events-none absolute left-0 top-0 origin-top-left border-2 border-violet-500" style={{ width: highlight.node.width * scale, height: highlight.node.height * scale, transform: `matrix(${highlight.matrix.slice(0, 4).join(',')},${highlight.matrix[4] * scale},${highlight.matrix[5] * scale})` }}/>}
          </div>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4 border border-violet-100 bg-violet-50/60 p-4"><div className="min-w-0"><p className="text-xs font-semibold text-violet-900"><span className="capitalize">{layout}</span>: {active.node.name}</p><p className="mt-1 text-[11px] text-violet-600">{Math.round(active.node.width)} × {Math.round(active.node.height)} · {paired ? 'Saved with the other version in one responsive page' : 'Selection saved. Add the other version or build now.'}</p></div><button disabled={disabled} className="primary-button" onClick={onBuild}>{paired ? 'Build responsive HTML →' : 'Build selected section →'}</button></div>
    {imported.warnings?.length > 0 && <details className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><summary className="cursor-pointer font-medium">{imported.warnings.length} import note{imported.warnings.length === 1 ? '' : 's'} — check design accuracy</summary><div className="mt-2 space-y-1">{imported.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div></details>}
  </div>;
}
