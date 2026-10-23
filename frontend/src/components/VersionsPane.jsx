import { useRef } from 'react';
import StudioIcon from './StudioIcon.jsx';

export default function VersionsPane({ versions, busy, error, onUpload, onUse, onRemove }) {
  const input = useRef(null);
  return <section className="min-h-[420px] p-5 sm:p-7" aria-label="JSON design versions">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600">Keep design snapshots</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">JSON versions</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Upload frame JSON exported from Figma, then load any version into the desktop, tablet, or mobile canvas.</p></div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><StudioIcon name="upload" size={16}/>{busy ? 'Importing…' : 'Upload frame JSON'}</button>
      <input ref={input} type="file" accept="application/json,.json" multiple className="hidden" aria-label="Upload JSON versions" disabled={busy} onChange={event => { if (event.target.files?.length) onUpload([...event.target.files]); event.target.value = ''; }}/>
    </div>
    {error && <p role="alert" className="mb-5 border-l-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!versions.length ? <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center"><span className="mb-4 border border-slate-200 bg-white p-3 text-violet-500"><StudioIcon name="layers" size={22}/></span><h3 className="font-semibold text-slate-800">No JSON versions yet</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Upload one or more exports from the Frame to Code Figma plugin to keep them ready for your next build.</p></div> : <ul className="divide-y divide-slate-100 border border-slate-200 bg-white">{versions.map(version => {
      const frame = version.data.design.frame;
      return <li key={version.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="border border-violet-100 bg-violet-50 p-2 text-violet-600"><StudioIcon name="layers" size={18}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800" title={version.file.name}>{frame.name || version.file.name}</p><p className="mt-1 text-xs text-slate-500">{version.file.name} · {Math.round(frame.width)} × {Math.round(frame.height)} · {(version.file.size / 1024).toFixed(0)} KB</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => onUse('desktop', version)} className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">Use desktop</button><button type="button" disabled={busy} onClick={() => onUse('tablet', version)} className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">Use tablet</button><button type="button" disabled={busy} onClick={() => onUse('mobile', version)} className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">Use mobile</button><button type="button" disabled={busy} onClick={() => onRemove(version.id)} className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-50">Remove</button></div>
      </li>;
    })}</ul>}
  </section>;
}
