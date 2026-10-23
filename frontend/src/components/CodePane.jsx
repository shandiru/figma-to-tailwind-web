import { useState } from 'react';

export default function CodePane({ code, onCopied }) {
  const [wrap, setWrap] = useState(true);
  const [error, setError] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setError('');
      onCopied();
    } catch { setError('Could not copy automatically. Select the HTML below and copy it manually.'); }
  };
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400"><span className="font-semibold text-violet-600">Tailwind HTML</span>{['sm', 'md', 'lg', 'xl', '2xl'].map(value => <span key={value} className="border border-slate-200 px-1.5 py-0.5 font-mono">{value}</span>)}</div>
        <div className="flex gap-2"><button type="button" aria-pressed={wrap} onClick={() => setWrap(value => !value)} className="border border-slate-200 px-3 py-2 text-xs text-slate-500">{wrap ? 'Wrap on' : 'Wrap off'}</button><button type="button" onClick={copy} className="bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Copy HTML</button></div>
      </div>
      {error && <p role="alert" className="mb-3 text-xs text-red-600">{error}</p>}
      <pre tabIndex={0} aria-label="Generated responsive HTML" className={`max-h-[70vh] min-w-0 max-w-full overflow-auto bg-ink p-4 font-mono text-xs leading-relaxed text-zinc-100 ${wrap ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' : 'whitespace-pre'}`}><code>{code}</code></pre>
    </div>
  );
}
