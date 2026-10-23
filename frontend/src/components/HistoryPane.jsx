import { useEffect, useState } from 'react';
import { downloadUrl, fetchHistory } from '../services/api.js';
import Skeleton from './Skeleton.jsx';
import StudioIcon from './StudioIcon.jsx';

const badge = { done: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-800', processing: 'bg-amber-100 text-amber-800' };

export default function HistoryPane({ refreshKey }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setItems(null);
    setError('');
    fetchHistory().then(value => { if (current) setItems(value); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [refreshKey]);

  if (error) return <p role="alert" className="border-l-2 border-red-500 bg-red-50 p-4 text-xs text-red-700">{error}</p>;
  if (!items) return <Skeleton lines={4} />;
  if (!items.length) return <div className="flex min-h-[450px] flex-col items-center justify-center border border-dashed border-slate-200 p-8 text-center"><span className="mb-5 border border-slate-200 p-4 text-violet-500"><StudioIcon name="history" size={24}/></span><h2 className="text-lg font-semibold tracking-tight text-slate-800">Your builds belong here.</h2><p className="mt-3 max-w-xs text-xs leading-6 text-slate-400">Upload your JSON and build a page. Your exports will appear here, ready for another look.</p></div>;

  return (
    <div><div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600">Made by you</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Export history</h2></div><span className="font-mono text-[10px] text-slate-400">{items.length} BUILD{items.length === 1 ? '' : 'S'}</span></div><ul className="divide-y divide-slate-100 border border-slate-200 bg-white">
      {items.map((c) => (
        <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><span className="hidden border border-slate-100 bg-slate-50 p-2.5 text-violet-500 sm:block"><StudioIcon name="code" size={17}/></span><div className="min-w-0">
            <p className="truncate text-xs font-semibold">{c.name}</p>
            <p className="mt-1 text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 text-xs font-medium ${badge[c.status]}`}>{c.status}</span>
            {c.status === 'done' && <a href={downloadUrl(c._id)} className="inline-flex items-center gap-2 text-[11px] font-semibold text-violet-600 hover:underline">Download ZIP<StudioIcon name="download" size={13}/></a>}
          </div>
        </li>
      ))}
    </ul></div>
  );
}
