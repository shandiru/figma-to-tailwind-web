import { useState } from 'react';
import { figmaRequest } from '../services/api.js';

export default function FigmaImport({ disabled, onImport, onBusy }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [file, setFile] = useState(null);
  const [query, setQuery] = useState('');
  const [desktopId, setDesktopId] = useState('');
  const [mobileId, setMobileId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const locked = disabled || !!busy;
  const load = async () => {
    setError(''); setBusy('frames'); onBusy(true);
    setFile(null); setDesktopId(''); setMobileId(''); setQuery('');
    try {
      const data = await figmaRequest('frames', { url: url.trim(), token });
      setFile(data);
      const selected = data.frames.find(frame => frame.id === data.selectedNodeId);
      if (selected) (selected.width < 768 ? setMobileId : setDesktopId)(selected.id);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); onBusy(false); }
  };
  const importSelected = async () => {
    setError(''); setBusy('import'); onBusy(true);
    try {
      const data = await figmaRequest('import', { url: url.trim(), token, desktopId, mobileId });
      onImport(data, file.name);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); onBusy(false); }
  };
  const choose = (id, mode) => {
    if (mode === 'desktop') { setDesktopId(desktopId === id ? '' : id); if (mobileId === id) setMobileId(''); }
    else { setMobileId(mobileId === id ? '' : id); if (desktopId === id) setDesktopId(''); }
  };
  return <div className="space-y-4">
    <div className="rounded-xl bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-800">Copy your Figma file or frame link. Pick the frames you want to build, without exporting a JSON file.</div>
    <div><label htmlFor="figma-url" className="field-label">Figma design link</label><input id="figma-url" type="url" className="workspace-input" placeholder="https://www.figma.com/design/…" value={url} disabled={locked} onChange={e => { setUrl(e.target.value); setFile(null); setError(''); }}/></div>
    <div><label htmlFor="figma-token" className="field-label">Personal access token <span className="font-normal text-slate-400">(or configure on server)</span></label><input id="figma-token" type="password" autoComplete="off" spellCheck={false} className="workspace-input" placeholder="figd_…" value={token} disabled={locked} onChange={e => { setToken(e.target.value); setFile(null); }}/><p className="mt-2 text-[11px] leading-5 text-slate-500">Needs file_content:read access. Used for this import; never saved to browser storage. <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noreferrer" className="text-violet-600 underline">Get a token</a></p></div>
    <button disabled={locked || !url.trim()} onClick={load} className="secondary-button w-full">{busy === 'frames' ? 'Reading your Figma file…' : file ? 'Refresh frames' : 'Browse frames →'}</button>
    {file && <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2"><h3 className="truncate text-sm font-semibold text-slate-800">{file.name}</h3><span className="shrink-0 text-xs text-slate-400">{file.frames.length} frames</span></div>
      {file.frames.length > 0 ? <>
        <input aria-label="Search frames" className="workspace-input" placeholder="Search frames or pages…" value={query} disabled={locked} onChange={e => setQuery(e.target.value)}/>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {file.frames.filter(f => `${f.name} ${f.page}`.toLowerCase().includes(query.toLowerCase())).map(frame => {
            const selected = desktopId === frame.id || mobileId === frame.id;
            return <div key={frame.id} className={`rounded-xl border p-3 transition ${selected ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-violet-500" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect x={frame.width < 768 ? 10 : 3} y="5" width={frame.width < 768 ? 12 : 26} height="22" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M13 11h6m-6 4h6m-6 4h4" stroke="currentColor"/></svg></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800" title={frame.name}>{frame.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{frame.page} · {Math.round(frame.width)} × {Math.round(frame.height)}</p></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2">{['desktop', 'mobile'].map(mode => <button key={mode} disabled={locked} aria-pressed={(mode === 'desktop' ? desktopId : mobileId) === frame.id} onClick={() => choose(frame.id, mode)} className={`rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize ${(mode === 'desktop' ? desktopId : mobileId) === frame.id ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-violet-300'}`}>{(mode === 'desktop' ? desktopId : mobileId) === frame.id ? '✓ ' : '+ '}{mode}</button>)}</div>
            </div>;
          })}
          {!file.frames.some(f => `${f.name} ${f.page}`.toLowerCase().includes(query.toLowerCase())) && <p className="py-5 text-center text-xs text-slate-500">No matching frames.</p>}
        </div>
        <p className="text-[11px] text-slate-500">Choose one desktop frame and/or one mobile frame.</p>
        <button disabled={locked || (!desktopId && !mobileId)} onClick={importSelected} className="primary-button w-full">{busy === 'import' ? 'Importing layers and artwork…' : 'Use selected frames →'}</button>
      </> : <p className="text-xs leading-5 text-slate-500">No frames found. Place your design inside a frame in Figma, then refresh.</p>}
    </div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-600">{error}</p>}
  </div>;
}
