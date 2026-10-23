import { useEffect, useState } from 'react';
import App from './App.jsx';
import AuthPage from './AuthPage.jsx';
import { authRequest, setCsrfToken } from '../services/http.js';
import Brand from '../components/Brand.jsx';

export default function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    let active = true;
    const expired = () => { setCsrfToken(''); setUser(null); setNotice('Your session ended. Please sign in again.'); };
    window.addEventListener('auth:expired', expired);
    authRequest('me').then(result => { if (active) setUser(result.user); }).catch(error => {
      if (active && error.status !== 401) setNotice('We could not connect to your account. Please try signing in.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener('auth:expired', expired); };
  }, []);
  const logout = async () => {
    setSigningOut(true); setNotice('');
    try { await authRequest('logout', {}); setUser(null); }
    catch (error) { if (error.status === 401) { setCsrfToken(''); setUser(null); } else setNotice(error.message); }
    finally { setSigningOut(false); }
  };
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#fafaf8]"><div className="space-y-6 text-center"><Brand/><p role="status" className="text-xs text-slate-500">Opening your workspace…</p></div></main>;
  return user ? <><App key={user.id} user={user} onLogout={logout} signingOut={signingOut}/>{notice && <div role="alert" className="fixed bottom-5 left-5 right-5 border border-red-200 bg-white p-4 text-sm text-red-700 shadow-lg">{notice}</div>}</> : <AuthPage notice={notice} onAuthenticated={value => { setNotice(''); setUser(value); }}/>;
}
