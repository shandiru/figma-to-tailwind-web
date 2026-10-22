import { useCallback, useEffect, useRef, useState } from 'react';
import PasteZone from '../components/PasteZone.jsx';
import ClipboardPaste from '../components/ClipboardPaste.jsx';
import SectionCanvas from '../components/SectionCanvas.jsx';
import PreviewPane from '../components/PreviewPane.jsx';
import CodePane from '../components/CodePane.jsx';
import HistoryPane from '../components/HistoryPane.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Toasts from '../components/Toasts.jsx';
import { useToast } from '../hooks/useToast.js';
import { convertDesigns, previewLayerFile } from '../services/api.js';
import { readResult } from '../utils/zip.js';
import { demoDesign } from '../data/demo.js';

const pluginUrl = `${import.meta.env.VITE_API_URL || '/api'}/plugin`;
const tabs = ['Design', 'Preview', 'Code', 'History'];
const jsonFile = data => new File([JSON.stringify(data)], 'figma-layers.json', { type: 'application/json' });

export default function App() {
  const [desktop, setDesktop] = useState(null);
  const [mobile, setMobile] = useState(null);
  const [pageName, setPageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('Design');
  const [historyKey, setHistoryKey] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [source, setSource] = useState('layers');
  const [pastes, setPastes] = useState({ desktop: null, mobile: null });
  const [pasteTarget, setPasteTarget] = useState('desktop');
  const [activeCanvas, setActiveCanvas] = useState('desktop');
  const pasted = pastes[activeCanvas];
  const [importing, setImporting] = useState(false);
  const busy = loading || importing;
  const { toasts, push } = useToast();
  const workspace = useRef(null);
  useEffect(() => {
    if (pasted && window.matchMedia('(max-width: 1279px)').matches) workspace.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pasted]);

  const convert = async (selection = {}) => {
    const selectedDesktop = Object.hasOwn(selection, 'desktop') ? selection.desktop : desktop;
    const selectedMobile = Object.hasOwn(selection, 'mobile') ? selection.mobile : mobile;
    const selectedName = selection.pageName || pageName.trim() || 'Untitled page';
    if (!selectedDesktop && !selectedMobile) return setError('Paste a Figma design and select a section to build.');
    setError(''); setLoading(true);
    try {
      const blob = await convertDesigns({ desktop: selectedDesktop, mobile: selectedMobile, options: { pageName: selectedName } });
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
    setResult(null); setPastes({ desktop: null, mobile: null }); setSource('layers'); setTab('Preview');
    push('Sample frames loaded. Click Build HTML to try it.', 'success');
  };

  const uploadLock = useRef(false);
  const uploadVersion = useCallback(async (mode, file) => {
    if (uploadLock.current) return;
    const setFile = mode === 'desktop' ? setDesktop : setMobile;
    if (!file) {
      setFile(null); setPastes(previous => ({ ...previous, [mode]: null })); setResult(null); setError('');
      return;
    }
    uploadLock.current = true; setImporting(true); setError('');
    try {
      const data = await previewLayerFile(file);
      setPastes(previous => ({ ...previous, [mode]: { ...data, uploadFile: file, id: crypto.randomUUID() } }));
      setFile(jsonFile(data.design));
      setActiveCanvas(mode); setPasteTarget(mode); setTab('Design');
      setPageName(previous => previous || data.design.frame.name); setResult(null);
      push(`${mode === 'desktop' ? 'Desktop' : 'Mobile'} JSON loaded. Choose a section on the canvas.`, 'success');
    } catch (err) { setError(err.message); }
    finally { uploadLock.current = false; setImporting(false); }
  }, [push]);
  const changeDesktop = useCallback(file => uploadVersion('desktop', file), [uploadVersion]);
  const changeMobile = useCallback(file => uploadVersion('mobile', file), [uploadVersion]);
  const selectDesktop = useCallback(design => { setDesktop(jsonFile(design)); setResult(null); setError(''); }, []);
  const selectMobile = useCallback(design => { setMobile(jsonFile(design)); setResult(null); setError(''); }, []);
  const receivePaste = data => {
    setPastes(previous => ({ ...previous, [pasteTarget]: { ...data, id: crypto.randomUUID() } }));
    (pasteTarget === 'desktop' ? setDesktop : setMobile)(jsonFile(data.design));
    setActiveCanvas(pasteTarget); setPageName(previous => previous || data.design.frame.name);
    setResult(null); setError(''); setTab('Design');
    push(data.design.issues?.length ? `${pasteTarget} pasted with missing artwork. Check the canvas notice.` : `${pasteTarget === 'desktop' ? 'Desktop' : 'Mobile'} saved. Paste the other version or build your page.`, data.design.issues?.length ? 'info' : 'success');
  };
  const removeVersion = mode => {
    (mode === 'desktop' ? changeDesktop : changeMobile)(null);
    const other = mode === 'desktop' ? 'mobile' : 'desktop';
    if (activeCanvas === mode && pastes[other]) setActiveCanvas(other);
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
          <div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-500"><span className="h-px w-6 bg-violet-300"/>Design to development</div><h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Your Figma. Ready for the web.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Upload your desktop and mobile design JSON. Choose matching sections. Build one responsive page.</p></div>
          <button disabled={busy} onClick={loadDemo} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-50">Try a sample design <span className="ml-2" aria-hidden="true">&#8599;</span></button>
        </div>

        {showGuide && <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-6" aria-label="Plugin setup">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-violet-950">One small plugin. All your layers.</h2><button onClick={() => setShowGuide(false)} aria-label="Close quick start" className="text-violet-500">&#215;</button></div>
          <ol className="mt-4 grid gap-4 text-sm leading-6 text-violet-900 md:grid-cols-3">
            <li><strong>01. Install once</strong><p className="mt-1 text-violet-700">Download and unzip the plugin. In Figma desktop: Plugins / Development / Import plugin from manifest. Choose manifest.json.</p></li>
            <li><strong>02. Export complete JSON</strong><p className="mt-1 text-violet-700">Select your frame, run Frame to Code v1.12, click Export complete JSON, then Download JSON. Artwork, editable text and a Figma comparison image are included.</p></li>
            <li><strong>03. Upload and choose sections</strong><p className="mt-1 text-violet-700">In Upload JSON, add the desktop file and optionally the mobile file. Compare Figma original with Generated HTML, choose matching sections, then Build responsive HTML.</p></li>
          </ol>
          <a href={pluginUrl} className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Download Figma plugin &#8595;</a>
        </section>}

        <div className="grid items-start gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="workspace-card p-6">
              <div className="mb-6 flex items-center gap-3"><span className="step-number">01</span><div><h2 className="text-sm font-semibold text-slate-800">Add your designs</h2><p className="mt-0.5 text-xs text-slate-400">Two versions. One responsive output.</p></div></div>
              <div role="group" aria-label="Import source" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">{[['clipboard', 'Paste design'], ['layers', 'Upload JSON']].map(([value, label]) => <button key={value} disabled={busy} aria-pressed={source === value} onClick={() => setSource(value)} className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition ${source === value ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
              {source === 'clipboard' && <div className="space-y-4">
                <div role="group" aria-label="Paste destination" className="grid grid-cols-2 gap-2">{['desktop', 'mobile'].map(mode => {
                  const ready = mode === 'desktop' ? desktop : mobile;
                  return <div key={mode} className={`min-w-0 rounded-xl border p-3 ${pasteTarget === mode ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 bg-white'}`}><button disabled={busy} aria-pressed={pasteTarget === mode} aria-label={`Paste ${mode} version`} onClick={() => { setPasteTarget(mode); setActiveCanvas(mode); setTab('Design'); }} className="w-full text-left"><span className="block text-xs font-semibold capitalize text-slate-800">{mode}</span><span className={`mt-1 block text-[10px] ${ready ? 'text-emerald-700' : 'text-slate-400'}`}>{ready ? '✓ Version ready' : 'Paste this version'}</span><span className="mt-2 block truncate text-[10px] text-slate-500" title={pastes[mode]?.design.frame.name}>{pastes[mode]?.design.frame.name || (ready ? 'Layers loaded' : mode === 'mobile' ? 'Mobile layout' : 'Desktop layout')}</span></button>{ready && <button disabled={busy} onClick={() => removeVersion(mode)} aria-label={`Remove ${mode} version`} className="mt-2 text-[10px] text-slate-400 hover:text-red-600">Remove</button>}</div>;
                })}</div>
                <ClipboardPaste key={pasteTarget} layout={pasteTarget} enabled={source === 'clipboard'} disabled={busy} onBusy={setImporting} onPasted={receivePaste}/>
                <p className="text-[11px] leading-5 text-slate-500">Paste each version into its own slot. Both are saved together and build into one responsive page.</p>
              </div>}
              {source === 'layers' && <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1"><p className="text-xs leading-5 text-slate-500 md:col-span-2 xl:col-span-1">Upload desktop and mobile JSON exported with artwork. Your design opens on the canvas so you can compare and choose sections.</p><PasteZone title="Desktop frame" file={pastes.desktop?.uploadFile || desktop} onChange={changeDesktop} disabled={busy}/><PasteZone title="Mobile frame" file={pastes.mobile?.uploadFile || mobile} onChange={changeMobile} disabled={busy}/></div>}
              <div className="mt-6 rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-500">Complex artwork missing from your paste? <button onClick={() => setShowGuide(true)} className="font-semibold text-violet-600 hover:underline">Use the Figma plugin &#8599;</button><br/>It includes artwork that Figma may leave out of the clipboard.</div>
            </section>
            <section className="workspace-card p-6">
              <div className="mb-5 flex items-center gap-3"><span className="step-number">02</span><h2 className="text-sm font-semibold text-slate-800">Make it yours</h2></div>
              <div aria-label="Responsive build inputs" className="mb-5 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><div className="flex justify-between"><span>Desktop</span><span className={desktop ? 'font-medium text-emerald-700' : 'text-slate-400'}>{desktop ? 'Ready' : 'Not added'}</span></div><div className="flex justify-between"><span>Mobile</span><span className={mobile ? 'font-medium text-emerald-700' : 'text-slate-400'}>{mobile ? 'Ready' : 'Not added'}</span></div><p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500">{desktop && mobile ? 'Both selections merge into one page. Mobile below 768px; desktop from 768px.' : 'Add both versions for their individual responsive layouts.'}</p></div>
              <label className="text-xs font-medium text-slate-500" htmlFor="page-name">Page name</label><input id="page-name" value={pageName} onChange={e => setPageName(e.target.value)} maxLength={80} placeholder="My next great idea" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 text-sm outline-none focus:border-violet-400 focus:bg-white"/>
              <div className="my-5 flex items-center justify-between text-xs"><span className="text-slate-400">Output</span><span className="font-medium text-slate-600">HTML · Tailwind · Assets</span></div>
              <button type="button" disabled={busy || (!desktop && !mobile)} onClick={convert} className="flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">{loading ? 'Building your page' : desktop && mobile ? 'Build responsive HTML' : 'Build HTML'}<span aria-hidden="true">{loading ? '...' : '\u2192'}</span></button>
              <p className="mt-3 text-center text-[10px] text-slate-400">No tokens. No generation wait. Your actual layers.</p>
              {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-600">{error}</p>}
            </section>
          </aside>

          <section ref={workspace} className="workspace-card min-w-0 scroll-mt-4 overflow-hidden" aria-label="Output workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div role="tablist" aria-label="Output view" className="flex gap-1 rounded-lg bg-slate-100/80 p-1">{tabs.map(value => <button key={value} role="tab" id={`tab-${value}`} aria-controls="output-panel" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-md px-4 py-2 text-xs font-semibold transition ${tab === value ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>{value}</button>)}</div>
              <button disabled={!result || busy} onClick={download} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-35">Download ZIP <span className="ml-2" aria-hidden="true">&#8599;</span></button>
            </div>
            <div id="output-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[690px] p-5">
              {(pastes.desktop || pastes.mobile) && <div hidden={tab !== 'Design' || busy}>
                <div role="group" aria-label="Design version" className="mb-4 flex gap-2">{['desktop', 'mobile'].map(mode => <button key={mode} disabled={busy || !pastes[mode]} aria-pressed={activeCanvas === mode} onClick={() => { setActiveCanvas(mode); setPasteTarget(mode); }} className={`rounded-lg border px-4 py-2 text-xs font-semibold capitalize disabled:opacity-40 ${activeCanvas === mode ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>{mode} canvas</button>)}</div>
                {['desktop', 'mobile'].map(mode => pastes[mode] && <div key={mode} data-canvas={mode} hidden={activeCanvas !== mode}><SectionCanvas key={pastes[mode].id} pasted={pastes[mode]} layout={mode} paired={Boolean(desktop && mobile)} disabled={busy} onSelect={mode === 'desktop' ? selectDesktop : selectMobile} onBuild={() => convert()} onRepair={() => { setShowGuide(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}/></div>)}
              </div>}
              {(loading || importing) && tab !== 'History' ? <><p role="status" className="mb-5 text-xs text-violet-600">{importing ? 'Reading copied Figma layers and preparing your canvas…' : 'Building your selected design…'}</p><Skeleton lines={10}/></> : tab === 'History' ? <HistoryPane refreshKey={historyKey}/> : tab === 'Design' && pasted ? null : result && tab !== 'Design' ? (tab === 'Preview' ? <PreviewPane html={result.preview} frames={result.stats?.frames}/> : <CodePane code={result.code} onCopied={() => push('HTML copied', 'success')}/>) : (
                <div className="empty-canvas flex min-h-[650px] flex-col items-center justify-center rounded-xl border border-slate-100 px-5 text-center">
                  <div className="canvas-illustration mb-9" aria-hidden="true"><div className="mock-design"><span/><div className="mock-title"/><div className="mock-line"/><div className="mock-line short"/><div className="mock-button"/></div><div className="mock-code"><span className="text-violet-300">&lt;main&gt;</span><br/><span className="pl-3 text-emerald-300">&lt;h1&gt;</span><span className="text-slate-200">Hello.</span><br/><span className="pl-3 text-amber-200">&lt;button&gt;</span><br/><span className="text-violet-300">&lt;/main&gt;</span></div><span className="mock-arrow">&#8594;</span></div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-800">Your next build starts here.</h2><p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Export complete JSON from the Figma plugin, then upload your desktop and mobile files. Compare the original and choose any section to build.</p>
                  <button onClick={loadDemo} disabled={busy} className="mt-6 text-xs font-semibold text-violet-500 hover:text-violet-700">Explore with a sample design &#8594;</button>
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
