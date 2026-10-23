import { useCallback, useEffect, useRef, useState } from 'react';
import JsonUpload from '../components/JsonUpload.jsx';
import SectionCanvas from '../components/SectionCanvas.jsx';
import PreviewPane from '../components/PreviewPane.jsx';
import CodePane from '../components/CodePane.jsx';
import HistoryPane from '../components/HistoryPane.jsx';
import VersionsPane from '../components/VersionsPane.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Toasts from '../components/Toasts.jsx';
import { useToast } from '../hooks/useToast.js';
import { convertDesigns, previewLayerFile } from '../services/api.js';
import { readResult } from '../utils/zip.js';
import { demoDesign } from '../data/demo.js';
import Brand from '../components/Brand.jsx';
import { API_BASE } from '../services/http.js';
import StudioIcon from '../components/StudioIcon.jsx';

const pluginUrl = `${API_BASE}/plugin`;
const tabs = ['Design', 'Preview', 'Code', 'Versions', 'History'];
const jsonFile = data => new File([JSON.stringify(data)], 'figma-layers.json', { type: 'application/json' });

export default function App({ user, onLogout, signingOut }) {
  const [desktop, setDesktop] = useState(null);
  const [tablet, setTablet] = useState(null);
  const [mobile, setMobile] = useState(null);
  const [pageName, setPageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('Design');
  const [historyKey, setHistoryKey] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [designs, setDesigns] = useState({ desktop: null, tablet: null, mobile: null });
  const [versions, setVersions] = useState([]);
  const [activeCanvas, setActiveCanvas] = useState('desktop');
  const imported = designs[activeCanvas];
  const [importing, setImporting] = useState(false);
  const busy = loading || importing;
  const { toasts, push } = useToast();
  const workspace = useRef(null);
  useEffect(() => {
    if (imported && window.matchMedia('(max-width: 1279px)').matches) workspace.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [imported]);

  const convert = async (selection = {}) => {
    const selectedDesktop = Object.hasOwn(selection, 'desktop') ? selection.desktop : desktop;
    const selectedTablet = Object.hasOwn(selection, 'tablet') ? selection.tablet : tablet;
    const selectedMobile = Object.hasOwn(selection, 'mobile') ? selection.mobile : mobile;
    const selectedName = selection.pageName || pageName.trim() || 'Untitled page';
    if (!selectedDesktop && !selectedTablet && !selectedMobile) return setError('Upload a Figma JSON file and select a section to build.');
    setError(''); setLoading(true);
    try {
      const blob = await convertDesigns({ desktop: selectedDesktop, tablet: selectedTablet, mobile: selectedMobile, options: { pageName: selectedName } });
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
    setDesktop(jsonFile(demoDesign())); setTablet(null); setMobile(jsonFile(demoDesign(true)));
    setPageName('Form and Field'); setError('');
    setResult(null); setDesigns({ desktop: null, tablet: null, mobile: null }); setTab('Preview');
    push('Sample frames loaded. Click Build HTML to try it.', 'success');
  };

  const uploadLock = useRef(false);
  const uploadVersion = useCallback(async (mode, file) => {
    if (uploadLock.current) return;
    const setFile = { desktop: setDesktop, tablet: setTablet, mobile: setMobile }[mode];
    if (!file) {
      setFile(null); setDesigns(previous => ({ ...previous, [mode]: null })); setResult(null); setError('');
      setActiveCanvas(current => current === mode ? (['desktop', 'tablet', 'mobile'].find(candidate => candidate !== mode && designs[candidate]) || current) : current);
      return;
    }
    uploadLock.current = true; setImporting(true); setError('');
    try {
      const data = await previewLayerFile(file);
      setDesigns(previous => ({ ...previous, [mode]: { ...data, uploadFile: file, id: crypto.randomUUID() } }));
      setFile(jsonFile(data.design));
      setActiveCanvas(mode); setTab('Design');
      setPageName(previous => previous || data.design.frame.name); setResult(null);
      push(`${mode[0].toUpperCase() + mode.slice(1)} JSON loaded. Choose a section on the canvas.`, 'success');
    } catch (err) { setError(err.message); }
    finally { uploadLock.current = false; setImporting(false); }
  }, [push, designs]);
  const changeDesktop = useCallback(file => uploadVersion('desktop', file), [uploadVersion]);
  const changeTablet = useCallback(file => uploadVersion('tablet', file), [uploadVersion]);
  const changeMobile = useCallback(file => uploadVersion('mobile', file), [uploadVersion]);
  const selectDesktop = useCallback(design => { setDesktop(jsonFile(design)); setResult(null); setError(''); }, []);
  const selectTablet = useCallback(design => { setTablet(jsonFile(design)); setResult(null); setError(''); }, []);
  const selectMobile = useCallback(design => { setMobile(jsonFile(design)); setResult(null); setError(''); }, []);
  const addVersions = async files => {
    setImporting(true); setError('');
    for (const file of files) {
      try {
        const data = await previewLayerFile(file);
        setVersions(previous => [...previous, { id: crypto.randomUUID(), file, data }]);
      } catch (err) { setError(`${file.name}: ${err.message}`); }
    }
    setImporting(false);
  };
  const useVersion = (mode, version) => {
    const item = { ...version.data, uploadFile: version.file, id: crypto.randomUUID() };
    ({ desktop: setDesktop, tablet: setTablet, mobile: setMobile }[mode])(jsonFile(version.data.design));
    setDesigns(previous => ({ ...previous, [mode]: item }));
    setActiveCanvas(mode); setResult(null); setError(''); setTab('Design');
    setPageName(previous => previous || version.data.design.frame.name);
    push(`Loaded ${version.data.design.frame.name} as ${mode}.`, 'success');
  };

  const readyCount = Number(Boolean(desktop)) + Number(Boolean(tablet)) + Number(Boolean(mobile));
  return <div className="studio min-h-screen bg-[#f4f5f7] text-slate-800">
    <aside className="studio-sidebar hidden xl:flex">
      <div className="border-b border-white/10 px-6 py-7"><Brand light/><p className="mt-4 pl-[52px] text-[9px] font-medium uppercase tracking-[.25em] text-slate-500">Design development studio</p></div>
      <nav className="space-y-1 p-4" aria-label="Workspace navigation">
        <p className="mb-4 px-3 text-[9px] font-semibold uppercase tracking-[.22em] text-slate-500">Your space</p>
        <button type="button" onClick={() => setTab('Design')} aria-current={!['Versions', 'History'].includes(tab) ? 'page' : undefined} className={`studio-nav ${!['Versions', 'History'].includes(tab) ? 'is-active' : ''}`}><StudioIcon name="grid"/><span>Design workspace</span><span className="ml-auto text-[10px] opacity-50">01</span></button>
        <button type="button" onClick={() => setTab('Versions')} aria-current={tab === 'Versions' ? 'page' : undefined} className={`studio-nav ${tab === 'Versions' ? 'is-active' : ''}`}><StudioIcon name="layers"/><span>JSON versions</span></button>
        <button type="button" onClick={() => setTab('History')} aria-current={tab === 'History' ? 'page' : undefined} className={`studio-nav ${tab === 'History' ? 'is-active' : ''}`}><StudioIcon name="history"/><span>Export history</span></button>
      </nav>
      <div className="mx-4 mt-6 border border-white/10 bg-white/[.025] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-medium text-white"><StudioIcon name="code" size={16}/>Start in Figma</div><p className="text-[11px] leading-5 text-slate-400">Export your frames with their artwork using the Frame to Code plugin.</p><a href={pluginUrl} className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] font-semibold text-violet-300">Get the plugin<StudioIcon name="download" size={14}/></a></div>
      <button type="button" onClick={() => setShowGuide(value => !value)} className="mx-4 mt-auto flex items-center gap-3 border-t border-white/10 px-3 py-5 text-xs text-slate-400 hover:text-white"><StudioIcon name="help" size={16}/>How it works</button>
      <div className="border-t border-white/10 px-5 py-5"><p className="mb-2 text-[9px] uppercase tracking-widest text-slate-500">Signed in as</p><p className="truncate text-xs font-medium text-white" title={user?.email}>{user?.email}</p><p className="mt-1 text-[10px] text-slate-500">Email verified · Private workspace</p></div>
    </aside>
    <div className="min-w-0 xl:ml-[228px]">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex min-h-[76px] items-center justify-between gap-4 px-5 sm:px-8"><div className="xl:hidden"><Brand/></div><div className="hidden items-center gap-3 text-xs text-slate-400 xl:flex"><StudioIcon name="grid" size={15}/><span>Workspace</span><span>/</span><span className="font-medium text-slate-800">Figma to HTML</span></div><div className="flex min-w-0 items-center gap-3 sm:gap-5"><button type="button" onClick={() => setShowGuide(value => !value)} className="hidden text-xs text-slate-500 hover:text-violet-700 sm:block">Quick start ↗</button><div className="hidden min-w-0 border-l border-slate-200 pl-5 md:block"><p className="max-w-[240px] truncate text-xs font-semibold text-slate-800" title={user?.email}>{user?.email}</p><p className="mt-1 text-[10px] text-slate-400">{user?.name}</p></div><button type="button" onClick={onLogout} disabled={signingOut || busy} className="studio-quiet-button"><span>{signingOut ? 'Signing out…' : 'Sign out'}</span><StudioIcon name="logout" size={14}/></button></div></div>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-8 lg:py-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-600">The workspace</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-slate-950 sm:text-4xl">Design in. Code out.</h1><p className="mt-2 text-xs leading-6 text-slate-500 sm:text-sm">Your Figma layers, brought to life in editable HTML.</p></div><button type="button" disabled={busy} onClick={loadDemo} className="studio-quiet-button bg-white"><StudioIcon name="grid" size={15}/>Try a sample design<StudioIcon name="arrow" size={14}/></button></div>
        <ol className="mb-7 grid grid-cols-3 border border-slate-200 bg-white" aria-label="Build progress">{[['Upload JSON', 'Bring in your frames', readyCount > 0], ['Choose sections', 'Find the right layout', Boolean(imported)], ['Build & export', 'Your next page, ready', Boolean(result)]].map(([label, detail, ready], index) => <li key={label} className={`flex min-w-0 items-center gap-3 px-3 py-4 sm:px-5 ${index ? 'border-l border-slate-200' : ''}`}><span className={`grid h-7 w-7 shrink-0 place-items-center font-mono text-[10px] ${ready ? 'bg-violet-600 text-white' : 'border border-slate-200 text-slate-400'}`}>{ready ? <StudioIcon name="check" size={14}/> : `0${index + 1}`}</span><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-800 sm:text-xs">{label}</p><p className="mt-1 hidden text-[10px] text-slate-400 sm:block">{detail}</p></div></li>)}</ol>
        {showGuide && <section className="mb-6 border border-violet-200 bg-white p-5 sm:p-6" aria-label="Plugin setup"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">From Figma to your first build</h2><button type="button" onClick={() => setShowGuide(false)} aria-label="Close quick start" className="text-xl text-slate-400">×</button></div><ol className="mt-4 grid gap-4 text-xs leading-6 text-slate-500 md:grid-cols-3"><li><strong className="text-violet-700">01 / Install the plugin</strong><p>Download and unzip the plugin. In Figma, import its manifest.json as a development plugin.</p></li><li><strong className="text-violet-700">02 / Export your frames</strong><p>Export desktop, tablet, or mobile frames as complete JSON files with the plugin.</p></li><li><strong className="text-violet-700">03 / Make your page</strong><p>Upload one or more frame sizes, choose matching sections on the canvas, then build and download your HTML.</p></li></ol><a href={pluginUrl} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-violet-700">Download Figma plugin<StudioIcon name="download" size={14}/></a></section>}
        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="workspace-card"><div className="studio-card-heading"><div className="flex items-center gap-2"><StudioIcon name="upload" size={16}/><h2>Source files</h2></div><span className="font-mono text-[10px] text-slate-400">{readyCount}/3 READY</span></div><div className="space-y-5 p-5" aria-label="JSON uploads"><JsonUpload title="Desktop frame" file={designs.desktop?.uploadFile || desktop} onChange={changeDesktop} disabled={busy}/><JsonUpload title="Tablet frame" file={designs.tablet?.uploadFile || tablet} onChange={changeTablet} disabled={busy}/><JsonUpload title="Mobile frame" file={designs.mobile?.uploadFile || mobile} onChange={changeMobile} disabled={busy}/><p className="border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">Use one, two, or all three frame sizes for responsive output. <button type="button" onClick={() => setShowGuide(true)} className="font-medium text-violet-600 hover:underline">Need the plugin?</button></p></div></section>
            <section className="workspace-card"><div className="studio-card-heading"><div className="flex items-center gap-2"><StudioIcon name="code" size={16}/><h2>Build settings</h2></div><span className="text-[9px] uppercase tracking-widest text-slate-400">HTML + Assets</span></div><div className="p-5"><label className="field-label" htmlFor="page-name">Page name</label><input id="page-name" value={pageName} onChange={event => setPageName(event.target.value)} maxLength={80} placeholder="My next great idea" className="w-full border border-slate-200 bg-slate-50 px-3 py-3 text-xs outline-none focus:border-violet-500 focus:bg-white"/><div aria-label="Responsive build inputs" className="my-5 space-y-3">{[['Desktop', desktop, 'monitor'], ['Tablet', tablet, 'tablet'], ['Mobile', mobile, 'phone']].map(([label, file, icon]) => <div key={label} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-2 text-slate-500"><StudioIcon name={icon} size={14}/>{label}</span><span className={file ? 'font-semibold text-emerald-700' : 'text-slate-400'}>{file ? 'Ready to build' : 'Not added'}</span></div>)}</div><button type="button" disabled={busy || !readyCount} onClick={() => convert()} className="flex w-full items-center justify-between bg-violet-600 px-4 py-3.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><span>{loading ? 'Building your page…' : readyCount > 1 ? 'Build responsive HTML' : 'Build HTML'}</span><StudioIcon name="arrow" size={16}/></button><p className="mt-3 text-center text-[10px] text-slate-400">Editable text. Real layers. Your code.</p>{error && <p role="alert" className="mt-4 border-l-2 border-red-500 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}</div></section>
          </aside>
          <section ref={workspace} className="workspace-card min-w-0 scroll-mt-4 overflow-hidden" aria-label="Output workspace">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-5"><div role="tablist" aria-label="Output view" className="flex min-w-0 gap-0.5 sm:gap-3">{tabs.map(value => <button key={value} type="button" role="tab" id={`tab-${value}`} aria-controls="output-panel" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-2 py-4 text-[11px] font-semibold transition sm:px-3 ${tab === value ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>{value}</button>)}</div><button type="button" disabled={!result || busy} onClick={download} className="my-2 inline-flex items-center gap-2 border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30"><StudioIcon name="download" size={13}/>Download ZIP</button></div>
            <div id="output-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[620px] p-3 sm:p-5">
              {(designs.desktop || designs.tablet || designs.mobile) && <div hidden={tab !== 'Design' || busy}><div role="group" aria-label="Design version" className="mb-5 flex gap-2">{['desktop', 'tablet', 'mobile'].map(mode => <button key={mode} type="button" disabled={busy || !designs[mode]} aria-pressed={activeCanvas === mode} onClick={() => setActiveCanvas(mode)} className={`inline-flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold capitalize disabled:opacity-30 ${activeCanvas === mode ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}><StudioIcon name={mode === 'desktop' ? 'monitor' : mode === 'tablet' ? 'tablet' : 'phone'} size={13}/>{mode} canvas</button>)}</div>{['desktop', 'tablet', 'mobile'].map(mode => designs[mode] && <div key={mode} data-canvas={mode} hidden={activeCanvas !== mode}><SectionCanvas key={designs[mode].id} imported={designs[mode]} layout={mode} paired={readyCount > 1} disabled={busy} onSelect={mode === 'desktop' ? selectDesktop : mode === 'tablet' ? selectTablet : selectMobile} onBuild={() => convert()} onRepair={() => { setShowGuide(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}/></div>)}</div>}
              {(loading || importing) && tab !== 'History' ? <div className="p-3"><p role="status" className="mb-5 flex items-center gap-2 text-xs text-violet-600"><span className="h-1.5 w-1.5 animate-pulse bg-violet-500"/>{importing ? 'Reading your JSON and preparing the canvas…' : 'Building your selected design…'}</p><Skeleton lines={10}/></div> : tab === 'History' ? <HistoryPane refreshKey={historyKey}/> : tab === 'Versions' ? <VersionsPane versions={versions} busy={busy} error={error} onUpload={addVersions} onUse={useVersion} onRemove={id => setVersions(previous => previous.filter(version => version.id !== id))}/> : tab === 'Design' && imported ? null : result && tab !== 'Design' ? (tab === 'Preview' ? <PreviewPane html={result.preview} frames={result.stats?.frames}/> : <CodePane code={result.code} onCopied={() => push('HTML copied', 'success')}/>) : <div className="studio-empty flex min-h-[590px] flex-col items-center justify-center border border-slate-100 px-5 py-10 text-center"><span className="mb-7 border border-slate-200 bg-white px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.15em] text-slate-400">Your canvas / Ready when you are</span><div className="studio-art mb-8" aria-hidden="true"><div className="studio-art-design"><div className="mb-4 flex justify-between"><span className="h-2 w-8 bg-violet-300"/><span className="h-2 w-2 bg-violet-100"/></div><div className="mb-2 h-2.5 w-20 bg-slate-700"/><div className="h-2.5 w-14 bg-slate-700"/><div className="mt-4 h-1 w-24 bg-slate-200"/><div className="mt-2 h-1 w-20 bg-slate-200"/><div className="mt-4 h-5 w-12 bg-violet-500"/></div><div className="studio-art-code"><span className="text-violet-300">&lt;section&gt;</span><br/><span className="pl-3 text-slate-300">Your next idea.</span><br/><span className="text-violet-300">&lt;/section&gt;</span></div><span className="studio-art-arrow"><StudioIcon name="arrow" size={18}/></span></div><h2 className="text-xl font-semibold tracking-tight text-slate-800">A blank canvas. Endless possibilities.</h2><p className="mt-3 max-w-sm text-xs leading-6 text-slate-400">Upload your Figma JSON to see your design here.<br/>Choose a section, build your page, make it yours.</p><button type="button" onClick={loadDemo} disabled={busy} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-violet-600 hover:text-violet-800">Explore a sample<StudioIcon name="arrow" size={14}/></button><div className="mt-12 flex flex-wrap justify-center gap-5 text-[10px] text-slate-400">{['Editable text', 'Preserved artwork', 'Responsive HTML'].map(label => <span key={label} className="flex items-center gap-1.5"><StudioIcon name="check" size={12} className="text-violet-400"/>{label}</span>)}</div></div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 font-mono text-[9px] text-slate-400"><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 ${result ? 'bg-emerald-500' : readyCount ? 'bg-violet-500' : 'bg-slate-300'}`}/>{result ? `${result.stats?.layers || 0} layers · ${result.stats?.textLayers || 0} text elements · ${result.stats?.assets || 0} assets` : readyCount ? `${readyCount} source file${readyCount > 1 ? 's' : ''} ready` : 'Waiting for source files'}</span><span>HTML / TAILWIND / WEBP</span></div>
            {result?.warnings?.length > 0 && <div className="border-t border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
          </section>
        </div>
        <footer className="mt-6 flex flex-wrap justify-between gap-2 text-[10px] leading-5 text-slate-400"><span>Made from your layers. Made for the web.</span><span>Frame to Code · Your private workspace · <a href="https://github.com/shandiru" target="_blank" rel="noreferrer" className="font-medium text-slate-500 hover:text-violet-700">Developed by Dirushan</a></span></footer>
      </main>
    </div>
    <Toasts toasts={toasts}/>
  </div>;
}
