import { useEffect, useRef, useState } from 'react';
import { usePasteTarget } from '../hooks/usePasteTarget.js';
import { fileFromTransfer } from '../utils/clipboard.js';

export default function PasteZone({ title, file, onChange, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);
  const select = value => {
    if (disabled) return;
    setError(''); onChange(value);
  };
  const zone = usePasteTarget(select, message => !disabled && setError(message));
  useEffect(() => {
    let current = true;
    setSummary(null);
    if (file) file.text().then(text => {
      const data = JSON.parse(text);
      if (!data.frame || !['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(data.format) || data.version !== 1) throw new Error('Invalid format');
      let count = 0;
      const pending = [data.frame];
      while (pending.length && count < 6001) {
        const layer = pending.pop(); count++;
        if (Array.isArray(layer.children)) pending.push(...layer.children);
      }
      if (data.format === 'figma-to-tailwind-packed') count = data.count;
      if (current) { setSummary({ name: data.frame.name, width: data.frame.width, height: data.frame.height, count }); setError(''); }
    }).catch(() => { if (current) { setError('This file is not a valid layer export. Export JSON from the included Figma plugin.'); onChange(null); } });
    return () => { current = false; };
  }, [file, onChange]);
  const receive = transfer => {
    if (disabled) return;
    try { const result = fileFromTransfer(transfer); if (result) select(result); }
    catch (err) { setError(err.message); }
  };
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between text-sm">
        <h3 className="font-semibold text-slate-700">{title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${file ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{file ? 'Connected' : 'Optional'}</span>
      </div>
      <div ref={zone} data-paste-zone tabIndex={disabled ? -1 : 0} role="button" aria-disabled={disabled} aria-label={`Paste or upload ${title} layers`}
        onClick={() => !disabled && input.current.click()}
        onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); if (!disabled) input.current.click(); } }}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); receive(e.dataTransfer); }}
        className={`paste-zone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''} ${disabled ? 'opacity-50' : ''}`}>
        <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${file ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-50 text-violet-500'}`}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            {file ? <path d="m5 12 4 4L19 6" /> : <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8m-4-4h8"/></>}
          </svg>
        </div>
        <p className="max-w-full truncate text-sm font-semibold text-slate-800">{summary?.name || 'Upload Figma design JSON'}</p>
        <p className="mt-2 text-center text-xs leading-6 text-slate-400">{summary ? `${summary.width} × ${summary.height} · ${summary.count} editable layers` : <>Export the frame with artwork from the plugin.<br/>Click or drop its JSON file here.</>}</p>
        <span className="mt-5 text-[11px] font-medium text-violet-500">{file ? 'Click to replace frame' : 'Text, styles & geometry included'}</span>
      </div>
      {file && <button type="button" disabled={disabled} onClick={() => { setError(''); onChange(null); }} className="mt-2 text-xs text-slate-400 hover:text-red-500">Remove frame</button>}
      {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
      <input ref={input} type="file" accept="application/json,.json" disabled={disabled} className="hidden" onChange={e => { receive({ files: e.target.files, getData: () => '' }); e.target.value = ''; }} />
    </section>
  );
}
