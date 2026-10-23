import { useEffect, useState } from 'react';
import { downloadUrl, fetchHistory } from '../services/api.js';
import Skeleton from './Skeleton.jsx';

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!items) return <Skeleton lines={4} />;
  if (!items.length) return <p className="text-sm text-zinc-500">No conversions yet. Upload a JSON design and build your page.</p>;

  return (
    <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">
      {items.map((c) => (
        <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-zinc-500">{new Date(c.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 text-xs font-medium ${badge[c.status]}`}>{c.status}</span>
            {c.status === 'done' && <a href={downloadUrl(c._id)} className="text-sm text-accent hover:underline">Download ZIP</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}
