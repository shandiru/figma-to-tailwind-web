import { useEffect, useRef, useState } from 'react';

export default function JsonUpload({ title, file, onChange, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);
  useEffect(() => {
    let current = true;
    setSummary(null);
    if (file) file.text().then(text => {
      const data = JSON.parse(text);
      if (!data.frame || !['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(data.format) || data.version !== 1) return;
      let count = 0;
      const pending = [data.frame];
      while (pending.length && count < 6001) {
        const layer = pending.pop(); count++;
        if (Array.isArray(layer.children)) pending.push(...layer.children);
      }
      if (current) setSummary({ name: data.frame.name, width: data.frame.width, height: data.frame.height, count: data.format === 'figma-to-tailwind-packed' ? data.count : count });
    }).catch(() => { /* The upload API shows validation errors without discarding the last valid design. */ });
    return () => { current = false; };
  }, [file]);
  const receive = files => {
    if (disabled || !files?.length) return;
    setError('');
    if (files.length !== 1 || !/\.json$/i.test(files[0].name)) return setError('Choose one JSON file exported from the Figma plugin.');
    onChange(files[0]);
  };
  return <section className="min-w-0">
    <div className="mb-3 flex items-center justify-between text-sm"><h3 className="font-semibold text-slate-700">{title}</h3><span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${file ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{file ? 'Connected' : 'Optional'}</span></div>
    <div tabIndex={disabled ? -1 : 0} role="button" aria-disabled={disabled} aria-label={`Upload ${title} JSON`}
      onClick={() => !disabled && input.current.click()}
      onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!disabled) input.current.click(); } }}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}
      className={`json-upload ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <div className={`mb-5 grid h-12 w-12 place-items-center ${file ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-50 text-violet-500'}`}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{file ? <path d="m5 12 4 4L19 6"/> : <><rect x="4" y="4" width="16" height="16"/><path d="M12 8v8m-4-4h8"/></>}</svg></div>
      <p className="max-w-full truncate text-sm font-semibold text-slate-800">{summary?.name || 'Upload Figma design JSON'}</p>
      <p className="mt-2 text-center text-xs leading-6 text-slate-400">{summary ? `${summary.width} × ${summary.height} · ${summary.count} editable layers` : <>Export the frame with artwork from the plugin.<br/>Click or drop its JSON file here.</>}</p>
      <span className="mt-5 text-[11px] font-medium text-violet-500">{file ? 'Click to replace frame' : 'Text, styles & geometry included'}</span>
    </div>
    {file && <button type="button" disabled={disabled} onClick={() => { setError(''); onChange(null); }} className="mt-2 text-xs text-slate-400 hover:text-red-500">Remove frame</button>}
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
    <input ref={input} type="file" accept="application/json,.json" aria-label={`${title} JSON file`} disabled={disabled} className="hidden" onChange={event => { receive(event.target.files); event.target.value = ''; }}/>
  </section>;
}
