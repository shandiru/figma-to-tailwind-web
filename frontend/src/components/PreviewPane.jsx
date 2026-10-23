import { useEffect, useRef, useState } from 'react';

export default function PreviewPane({ html, frames }) {
  const [mode, setMode] = useState('desktop');
  const [availableWidth, setAvailableWidth] = useState(800);
  const container = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const widths = { mobile: frames?.mobile?.width || 390, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536, desktop: frames?.desktop?.width || 1440 };
  const viewportWidth = widths[mode];
  const scale = Math.max(0.1, Math.min(1, (availableWidth - 24) / viewportWidth));
  return (
    <div className="space-y-3">
      <div className="inline-flex max-w-full flex-wrap gap-0.5 border border-zinc-300 bg-white p-0.5 text-xs" role="group" aria-label="Preview size">
        {['mobile', 'sm', 'md', 'lg', 'xl', '2xl', 'desktop'].map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 capitalize ${mode === m ? 'bg-ink text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400">{viewportWidth}px viewport · Fit {Math.round(scale * 100)}%</p>
      <div ref={container} className="flex justify-center overflow-hidden border border-slate-200 bg-slate-100 p-3">
        <div className="relative shrink-0" style={{ width: viewportWidth * scale, height: 600 }}>
        <iframe
          title="Generated page preview"
          srcDoc={html}
          sandbox="allow-scripts"
          className="absolute left-0 top-0 origin-top-left border-0 bg-white shadow-sm"
          style={{ width: viewportWidth, height: 600 / scale, transform: `scale(${scale})` }}
        />
        </div>
      </div>
    </div>
  );
}
