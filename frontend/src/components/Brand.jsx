export default function Brand({ light = false }) {
  return <a href="/" className={`inline-flex items-center gap-3 ${light ? 'text-white' : 'text-slate-950'}`} aria-label="Frame to Code home">
    <span className={`grid h-10 w-10 place-items-center border ${light ? 'border-white/30' : 'border-violet-600 bg-violet-600 text-white'}`} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 4H5v16h4m6-16h4V4h-4M9 9l-3 3 3 3m6-6 3 3-3 3"/></svg></span>
    <span className="text-xl font-semibold tracking-tight">frame<span className={light ? 'text-violet-300' : 'text-violet-600'}>to</span>code<span className="ml-1 text-violet-400">.</span></span>
  </a>;
}
