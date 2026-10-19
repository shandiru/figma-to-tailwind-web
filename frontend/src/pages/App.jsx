import { useState } from 'react';
import PasteZone from '../components/PasteZone.jsx';
import PreviewPane from '../components/PreviewPane.jsx';
import CodePane from '../components/CodePane.jsx';
import HistoryPane from '../components/HistoryPane.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Toasts from '../components/Toasts.jsx';
import { useToast } from '../hooks/useToast.js';
import { convertDesigns } from '../services/api.js';
import { readResult } from '../utils/zip.js';
import { demoDesign } from '../data/demo.js';

const pluginUrl = `${import.meta.env.VITE_API_URL || '/api'}/plugin`;
const tabs = ['Preview', 'Code', 'History'];
const jsonFile = data => new File([JSON.stringify(data)], 'figma-layers.json', { type: 'application/json' });

export default function App() {
  const [desktop, setDesktop] = useState(null);
  const [mobile, setMobile] = useState(null);
  const [pageName, setPageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('Preview');
  const [historyKey, setHistoryKey] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const { toasts, push } = useToast();

  const convert = async () => {
    if (!desktop && !mobile) return setError('Paste at least one frame from the Figma plugin to get started.');
    setError(''); setLoading(true);
    try {
      const blob = await convertDesigns({ desktop, mobile, options: { pageName: pageName.trim() || 'Untitled page' } });
      setResult({ blob, ...(await readResult(blob)) });
      setTab('Preview'); setHistoryKey(k => k + 1);
      push('Your editable page is ready', 'success');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  const download = () => {
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(result.blob);
    anchor.href = url; anchor.download = `${(pageName || 'page').replace(/\W+/g, '-').toLowerCase()}.zip`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const loadDemo = () => {
    setDesktop(jsonFile(demoDesign())); setMobile(jsonFile(demoDesign(true)));
    setPageName('Form and Field'); setError('');
    push('Sample frames loaded. Click Build HTML to try it.', 'success');
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Frame to Code home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 4H5v16h4m6-16h4v16h-4M9 9l-3 3 3 3m6-6 3 3-3 3"/></svg></span>
            <div><span className="text-lg font-bold tracking-tight text-slate-900">frame<span className="text-violet-500">to</span>code</span><span className="ml-2 hidden rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-slate-400 sm:inline">WORKSPACE</span></div>
          </a>
          <div className="flex items-center gap-5"><span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>No AI required</span><button onClick={() => setShowGuide(!showGuide)} className="text-sm font-medium text-slate-500 hover:text-violet-600">Quick start <span aria-hidden="true">&#8599;</span></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-500"><span className="h-px w-6 bg-violet-300"/>Design to development</div><h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Your Figma. Ready for the web.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Bring your layers, keep the details. Turn exported Figma frames into editable HTML.</p></div>
          <button disabled={loading} onClick={loadDemo} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-50">Try a sample design <span className="ml-2" aria-hidden="true">&#8599;</span></button>
        </div>

        {showGuide && <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-6" aria-label="Plugin setup">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-violet-950">One small plugin. All your layers.</h2><button onClick={() => setShowGuide(false)} aria-label="Close quick start" className="text-violet-500">&#215;</button></div>
          <ol className="mt-4 grid gap-4 text-sm leading-6 text-violet-900 md:grid-cols-3">
            <li><strong>01. Install once</strong><p className="mt-1 text-violet-700">Download and unzip the plugin. In Figma desktop: Plugins / Development / Import plugin from manifest. Choose manifest.json.</p></li>
            <li><strong>02. Copy your frame</strong><p className="mt-1 text-violet-700">Select a frame, run Frame to Code, then Export selected frame / Copy layers. Normal Ctrl+C is not supported.</p></li>
            <li><strong>03. Paste and build</strong><p className="mt-1 text-violet-700">Hover a zone below, paste, and build. Add a mobile frame for a separate mobile layout. You can also upload the plugins JSON file.</p></li>
          </ol>
          <a href={pluginUrl} className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Download Figma plugin &#8595;</a>
        </section>}

        <div className="grid items-start gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="workspace-card p-6">
              <div className="mb-6 flex items-center gap-3"><span className="step-number">01</span><div><h2 className="text-sm font-semibold text-slate-800">Add your designs</h2><p className="mt-0.5 text-xs text-slate-400">One frame to start. Two for responsive.</p></div></div>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1"><PasteZone title="Desktop frame" file={desktop} onChange={setDesktop} disabled={loading}/><PasteZone title="Mobile frame" file={mobile} onChange={setMobile} disabled={loading}/></div>
              <div className="mt-6 rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-500">First time here? <button onClick={() => setShowGuide(true)} className="font-semibold text-violet-600 hover:underline">Get the Figma plugin &#8599;</button><br/>Copy layers with the plugin, then paste above.</div>
            </section>
            <section className="workspace-card p-6">
              <div className="mb-5 flex items-center gap-3"><span className="step-number">02</span><h2 className="text-sm font-semibold text-slate-800">Make it yours</h2></div>
              <label className="text-xs font-medium text-slate-500" htmlFor="page-name">Page name</label><input id="page-name" value={pageName} onChange={e => setPageName(e.target.value)} maxLength={80} placeholder="My next great idea" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 text-sm outline-none focus:border-violet-400 focus:bg-white"/>
              <div className="my-5 flex items-center justify-between text-xs"><span className="text-slate-400">Output</span><span className="font-medium text-slate-600">HTML · Tailwind · Assets</span></div>
              <button type="button" disabled={loading || (!desktop && !mobile)} onClick={convert} className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">{loading ? 'Building your page' : 'Build HTML'}<span aria-hidden="true">{loading ? '...' : '\u2192'}</span></button>
              <p className="mt-3 text-center text-[10px] text-slate-400">No tokens. No generation wait. Your actual layers.</p>
              {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-600">{error}</p>}
            </section>
          </aside>

          <section className="workspace-card min-w-0 overflow-hidden" aria-label="Output workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div role="tablist" aria-label="Output view" className="flex gap-1 rounded-lg bg-slate-100/80 p-1">{tabs.map(value => <button key={value} role="tab" id={`tab-${value}`} aria-controls="output-panel" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-md px-4 py-2 text-xs font-semibold transition ${tab === value ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>{value}</button>)}</div>
              <button disabled={!result || loading} onClick={download} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-35">Download ZIP <span className="ml-2" aria-hidden="true">&#8599;</span></button>
            </div>
            <div id="output-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[690px] p-5">
              {loading && tab !== 'History' ? <Skeleton lines={10}/> : tab === 'History' ? <HistoryPane refreshKey={historyKey}/> : result ? (tab === 'Preview' ? <PreviewPane html={result.preview} frames={result.stats?.frames}/> : <CodePane code={result.code} onCopied={() => push('HTML copied', 'success')}/>) : (
                <div className="empty-canvas flex min-h-[650px] flex-col items-center justify-center rounded-xl border border-slate-100 px-5 text-center">
                  <div className="canvas-illustration mb-9" aria-hidden="true"><div className="mock-design"><span/><div className="mock-title"/><div className="mock-line"/><div className="mock-line short"/><div className="mock-button"/></div><div className="mock-code"><span className="text-violet-300">&lt;main&gt;</span><br/><span className="pl-3 text-emerald-300">&lt;h1&gt;</span><span className="text-slate-200">Hello.</span><br/><span className="pl-3 text-amber-200">&lt;button&gt;</span><br/><span className="text-violet-300">&lt;/main&gt;</span></div><span className="mock-arrow">&#8594;</span></div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-800">Your next build starts here.</h2><p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Paste your exported Figma layers, then hit Build HTML. Your design will come to life right here.</p>
                  <button onClick={loadDemo} disabled={loading} className="mt-6 text-xs font-semibold text-violet-500 hover:text-violet-700">Explore with a sample design &#8594;</button>
                  <div className="mt-14 flex flex-wrap justify-center gap-5 text-[10px] text-slate-400"><span>&#10003; Editable text</span><span>&#10003; Real layer elements</span><span>&#10003; Local conversion</span></div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400"><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${result ? 'bg-emerald-400' : 'bg-slate-300'}`}/>{result ? `${result.stats?.layers || 0} layers · ${result.stats?.textLayers || 0} text elements · ${result.stats?.assets || 0} assets` : 'Waiting for your design'}</span><span>Frame geometry preserved</span></div>
            {result?.warnings?.length > 0 && <div className="border-t border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800">{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
          </section>
        </div>
        <footer className="mt-7 flex flex-wrap justify-between gap-3 text-[10px] leading-5 text-slate-400"><p>Built from your layers. Text stays text. Artwork stays artwork.</p><p>Fixed frame layouts scale to fit · Mobile switches at 768px · Interactions need implementation</p></footer>
      </main><Toasts toasts={toasts}/>
    </div>
  );
}
