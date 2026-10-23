import { useEffect, useState } from 'react';
import { fetchActiveUsers } from '../services/api.js';

const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function AdminUsersPane() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchActiveUsers().then(result => { if (active) setUsers(result.users || []); })
      .catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section aria-label="Active users" className="space-y-5">
    <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-violet-600">Administration</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Active users</h2><p className="mt-2 text-xs leading-5 text-slate-500">Verified accounts with access to the workspace.</p></div>
    {error && <p role="alert" className="border-l-2 border-red-500 bg-red-50 p-4 text-xs text-red-700">{error}</p>}
    {loading ? <p role="status" className="p-4 text-xs text-slate-500">Loading users…</p> : error ? null : !users.length ? <p className="border border-slate-200 bg-white p-6 text-xs text-slate-500">No active users found.</p> : <div className="overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4 font-semibold">Name</th><th className="px-5 py-4 font-semibold">Email</th><th className="px-5 py-4 font-semibold">Role</th><th className="px-5 py-4 font-semibold">Joined</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(user => <tr key={user.id}><td className="px-5 py-4 font-medium text-slate-800">{user.name}</td><td className="px-5 py-4 text-slate-600">{user.email}</td><td className="px-5 py-4 capitalize text-slate-600">{user.role === 'superadmin' ? 'Super Admin' : 'User'}</td><td className="px-5 py-4 text-slate-500">{dateLabel(user.joinedAt)}</td></tr>)}</tbody></table></div>}
    {!error && !loading && <p className="text-[10px] text-slate-400">{users.length} verified account{users.length === 1 ? '' : 's'}</p>}
  </section>;
}
