import { useEffect, useRef, useState } from 'react';
import StudioIcon from './StudioIcon.jsx';

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
    <div className="mb-2.5 flex items-center justify-between text-xs"><h3 className="flex items-center gap-2 font-semibold text-slate-700"><StudioIcon name={title.startsWith('Mobile') ? 'phone' : title.startsWith('Tablet') ? 'tablet' : 'monitor'} size={14}/>{title}</h3><span className={`text-[9px] font-medium ${file ? 'text-emerald-600' : 'text-slate-400'}`}>{file ? '✓ Added' : '.JSON'}</span></div>
    <div tabIndex={disabled ? -1 : 0} role="button" aria-disabled={disabled} aria-label={`Upload ${title} JSON`}
      onClick={() => !disabled && input.current.click()}
      onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!disabled) input.current.click(); } }}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}
      className={`json-upload ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <div className={`mb-3 grid h-9 w-9 place-items-center ${file ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-violet-500 shadow-sm'}`}><StudioIcon name={file ? 'check' : 'upload'} size={17}/></div>
      <p className="max-w-full truncate text-xs font-semibold text-slate-800" title={summary?.name || file?.name}>{summary?.name || 'Drop your JSON here'}</p>
      <p className="mt-1.5 text-center text-[10px] leading-5 text-slate-400">{summary ? `${summary.width} × ${summary.height} · ${summary.count} layers` : <>or <span className="font-medium text-violet-600">browse files</span> to upload</>}</p>
      {file && <span className="mt-2 max-w-full truncate font-mono text-[9px] text-slate-400" title={file.name}>{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`} · Click to replace</span>}
    </div>
    {file && <button type="button" disabled={disabled} onClick={() => { setError(''); onChange(null); }} className="mt-2 text-xs text-slate-400 hover:text-red-500">Remove frame</button>}
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
    <input ref={input} type="file" accept="application/json,.json" aria-label={`${title} JSON file`} disabled={disabled} className="hidden" onChange={event => { receive(event.target.files); event.target.value = ''; }}/>
  </section>;
}
