import { useCallback, useEffect, useState } from 'react';
import Brand from './Brand.jsx';
import { fetchAdminDashboard } from '../services/api.js';
import StudioIcon from './StudioIcon.jsx';

const dateTime = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const actionLabels = {
  'account.verified': 'Account verified',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'admin.dashboard_viewed': 'Viewed the admin dashboard',
};

function StatCard({ label, value, detail, icon }) {
  return <article className="border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{label}</p><StudioIcon name={icon} size={16} className="text-violet-600"/></div><p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value ?? '—'}</p><p className="mt-2 text-[11px] text-slate-400">{detail}</p></article>;
}

export default function SuperAdminDashboard({ user, onOpenWorkspace, onLogout, signingOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fetchAdminDashboard()); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refresh]);
  return <div className="min-h-screen bg-[#f4f5f7] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8"><Brand/><div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-semibold text-slate-800">{user.name}</span><span className="mt-1 block text-[10px] text-slate-400">Super Admin</span></span><button type="button" onClick={onOpenWorkspace} className="studio-quiet-button"><StudioIcon name="grid" size={14}/>Design workspace</button><button type="button" onClick={onLogout} disabled={signingOut} className="studio-quiet-button"><span>{signingOut ? 'Signing out…' : 'Sign out'}</span><StudioIcon name="logout" size={14}/></button></div></div></header>
    <main className="mx-auto max-w-[1600px] space-y-7 px-4 py-8 sm:px-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-600">Administration / Overview</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-slate-950 sm:text-4xl">Super Admin dashboard</h1><p className="mt-2 text-sm text-slate-500">User accounts, active sessions, and recent security events.</p></div><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="studio-quiet-button bg-white"><StudioIcon name="history" size={14}/>{loading ? 'Refreshing…' : 'Refresh data'}</button></div>
      {error && <p role="alert" className="border-l-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account summary"><StatCard label="Verified accounts" value={data?.summary.totalUsers} detail="All accounts with verified email" icon="users"/><StatCard label="Active sessions" value={data?.summary.activeUsers} detail="Accounts with an unexpired session" icon="check"/><StatCard label="New this month" value={data?.summary.recentSignups} detail="Verified signups in the last 30 days" icon="history"/><StatCard label="Super Admins" value={data?.summary.totalAdmins} detail="Accounts with admin access" icon="help"/></section>
      <section className="overflow-hidden border border-slate-200 bg-white" aria-label="User accounts"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">User accounts</h2><p className="mt-1 text-[11px] text-slate-400">Verified account and sign-in details</p></div><span className="font-mono text-[10px] text-slate-400">{data?.users?.length ?? 0} USERS</span></div>{loading && !data ? <p role="status" className="p-5 text-xs text-slate-500">Loading account data…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-semibold">User</th><th className="px-5 py-3 font-semibold">Role</th><th className="px-5 py-3 font-semibold">Session</th><th className="px-5 py-3 font-semibold">Joined</th><th className="px-5 py-3 font-semibold">Email verified</th><th className="px-5 py-3 font-semibold">Last sign-in</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.users?.map(account => <tr key={account.id}><td className="px-5 py-4"><p className="font-medium text-slate-800">{account.name}</p><p className="mt-1 text-[11px] text-slate-500">{account.email}</p></td><td className="px-5 py-4 text-slate-600">{account.role === 'superadmin' ? 'Super Admin' : 'User'}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-2 ${account.hasActiveSession ? 'text-emerald-700' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${account.hasActiveSession ? 'bg-emerald-500' : 'bg-slate-300'}`}/>{account.hasActiveSession ? 'Session valid' : 'Signed out'}</span></td><td className="px-5 py-4 text-slate-500">{dateTime(account.joinedAt)}</td><td className="px-5 py-4 text-slate-500">{dateTime(account.verifiedAt)}</td><td className="px-5 py-4 text-slate-500">{dateTime(account.lastLoginAt)}</td></tr>)}{!data?.users?.length && !loading && <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">No verified accounts found.</td></tr>}</tbody></table></div>}</section>
      <section className="overflow-hidden border border-slate-200 bg-white" aria-label="Audit log"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Audit log</h2><p className="mt-1 text-[11px] text-slate-400">Latest account and administrator events</p></div><span className="font-mono text-[10px] text-slate-400">LATEST 50</span></div>{loading && !data ? <p role="status" className="p-5 text-xs text-slate-500">Loading activity…</p> : <div className="divide-y divide-slate-100">{data?.activity?.map(event => <article key={event.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center bg-violet-50 text-violet-700"><StudioIcon name={event.action.includes('admin') ? 'help' : 'history'} size={14}/></span><div className="min-w-0"><p className="text-xs font-medium text-slate-800">{actionLabels[event.action] || event.action}</p><p className="mt-1 truncate text-[11px] text-slate-500">{event.actorEmail}{event.targetEmail ? ` · ${event.targetEmail}` : ''}</p></div></div><time className="text-[10px] text-slate-400">{dateTime(event.createdAt)}</time></article>)}{!data?.activity?.length && !loading && <p className="px-5 py-8 text-center text-xs text-slate-500">No audit events recorded yet.</p>}</div>}</section>
      <p className="text-[10px] leading-5 text-slate-400">Session status means the account has an unexpired sign-in session. Audit events store account emails and event times; passwords and session tokens are never included.</p>
    </main>
  </div>;
}
