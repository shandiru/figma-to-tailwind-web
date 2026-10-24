import { useEffect, useState } from 'react';
import { authRequest } from '../services/http.js';
import Brand from '../components/Brand.jsx';

export default function AuthPage({ onAuthenticated, notice = '', superAdminRegistration = false }) {
  const [mode, setMode] = useState(superAdminRegistration ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [superAdminKeyword, setSuperAdminKeyword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const switchMode = value => {
    setMode(value); setPassword(''); setCode(''); setChallengeId(''); setError(''); setMessage('');
  };
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'register') {
        if (superAdminRegistration && !superAdminKeyword.trim()) throw new Error('Enter the Super Admin creation keyword.');
        const result = await authRequest('register', { name, email, password, ...(superAdminRegistration ? { superAdminKeyword } : {}) });
        setChallengeId(result.challengeId); setResendAt(Date.now() + result.resendAfter * 1000);
        setPassword(''); setSuperAdminKeyword(''); setMode('verify'); setMessage(result.message);
      } else {
        const result = await authRequest(mode === 'verify' ? 'verify-email' : 'login', mode === 'verify' ? { challengeId, code } : { email, password });
        setPassword(''); setCode(''); onAuthenticated(result.user);
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy || remaining) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await authRequest('resend-code', { challengeId });
      setResendAt(Date.now() + result.resendAfter * 1000); setMessage(result.message); setCode('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const verifying = mode === 'verify';
  return <main className="auth-layout min-h-screen lg:grid lg:grid-cols-[1fr_1fr]">
    <section className="auth-story relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#171a2b] p-12 text-white lg:flex xl:p-16">
      <Brand light/>
      <div className="relative z-10 max-w-lg py-16">
        <p className="mb-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.25em] text-violet-300"><span className="h-px w-8 bg-violet-400"/>A place for your next idea</p>
        <h1 className="text-5xl font-medium leading-[1.12] tracking-[-.04em] xl:text-6xl">Convert Figma designs.<br/><span className="text-violet-300">Build responsive code.</span></h1>
        <p className="mt-7 max-w-sm text-base leading-7 text-slate-300">Turn Figma frames into editable Tailwind CSS, HTML, React, or Vue while preserving real text, artwork, and responsive layouts.</p>
        <div className="auth-diagram mt-12 border border-white/15 bg-white/[.035] p-6" aria-hidden="true"><div className="mb-5 flex justify-between font-mono text-[10px] uppercase tracking-widest text-slate-400"><span>design.fig</span><span>index.html</span></div><div className="flex items-center gap-5"><div className="grid h-16 w-24 grid-cols-3 gap-1 border border-violet-300/40 p-2"><span className="col-span-2 bg-violet-300/70"/><span className="row-span-2 bg-violet-200/20"/><span className="col-span-2 bg-violet-200/20"/></div><span className="text-2xl text-violet-300">→</span><div className="font-mono text-sm leading-6"><span className="text-violet-300">&lt;main&gt;</span><br/><span className="pl-3 text-slate-200">Your next idea.</span><br/><span className="text-violet-300">&lt;/main&gt;</span></div></div></div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/15 pt-6 text-xs text-slate-400"><span>Editable HTML</span><span>Responsive layouts</span><span>Your private workspace</span></div>
    </section>
    <section className="flex min-h-screen flex-col bg-[#fafaf8] px-6 py-8 sm:px-12 lg:px-16">
      <div className="flex items-center justify-between gap-5 lg:justify-end"><span className="lg:hidden"><Brand/></span>{superAdminRegistration ? <a href="/" className="text-xs font-semibold text-violet-700 underline-offset-4 hover:underline">Back to sign in ↗</a> : <span className="text-xs text-slate-500">{mode === 'login' ? 'New around here?' : 'Already have an account?'} <button type="button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="ml-2 font-semibold text-violet-700 underline-offset-4 hover:underline disabled:opacity-50">{mode === 'login' ? 'Create an account' : 'Sign in'} ↗</button></span>}</div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
        <p className="mb-5 text-[10px] font-semibold uppercase tracking-[.24em] text-violet-600">{verifying ? 'One last step' : superAdminRegistration ? 'Super Admin setup' : mode === 'register' ? 'Start building' : 'Your workspace awaits'}</p>
        <h2 className="text-4xl font-semibold tracking-[-.04em] text-slate-950">{verifying ? 'Check your inbox.' : superAdminRegistration ? 'Create a Super Admin account.' : mode === 'register' ? 'Make room for ideas.' : 'Welcome back.'}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{verifying ? <>Enter the six-digit code sent to <strong className="break-all font-medium text-slate-800">{email}</strong>. It expires in 10 minutes.</> : superAdminRegistration ? 'Enter the private creation keyword and verify your email to enable Super Admin access.' : mode === 'register' ? 'Create your account. We’ll verify your email before you enter.' : 'Sign in to your designs, exports, and everything in between.'}</p>
        {notice && <p role="status" className="mt-5 border-l-2 border-violet-500 bg-violet-50 p-3 text-xs leading-5 text-violet-900">{notice}</p>}
        <form onSubmit={submit} className="mt-8 space-y-5">
          <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
            {mode === 'register' && <div><label htmlFor="auth-name" className="field-label">Your name</label><input id="auth-name" className="auth-input" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="How should we call you?"/></div>}
            {mode === 'register' && superAdminRegistration && <div><label htmlFor="auth-super-admin-keyword" className="field-label">Super Admin creation keyword</label><input id="auth-super-admin-keyword" className="auth-input" type="password" autoComplete="off" required maxLength={256} value={superAdminKeyword} onChange={event => setSuperAdminKeyword(event.target.value)} placeholder="Enter the private keyword"/><p className="mt-2 text-[11px] leading-5 text-slate-400">The keyword is checked securely by the backend.</p></div>}
            {!verifying && <><div><label htmlFor="auth-email" className="field-label">Email address</label><input id="auth-email" className="auth-input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></div><div><label htmlFor="auth-password" className="field-label">Password</label><div className="relative"><input id="auth-password" className="auth-input pr-16" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 15 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'A long, memorable passphrase' : 'Enter your password'}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-4 text-[11px] font-semibold text-slate-500">{showPassword ? 'Hide' : 'Show'}</button></div>{mode === 'register' && <p className="mt-2 text-[11px] leading-5 text-slate-400">15–128 characters. A few memorable words work well.</p>}</div></>}
            {verifying && <div><label htmlFor="auth-code" className="field-label">Verification code</label><input id="auth-code" className="auth-input text-center font-mono text-2xl tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoFocus/></div>}
          </fieldset>
          {error && <p role="alert" className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>}
          {message && <p role="status" className="border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">{message}</p>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-between bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"><span>{busy ? 'Please wait…' : verifying ? 'Verify email & enter' : mode === 'register' ? 'Create account' : 'Sign in'}</span><span aria-hidden="true">→</span></button>
        </form>
        {verifying && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs"><button type="button" onClick={resend} disabled={busy || remaining > 0} className="font-semibold text-violet-700 disabled:text-slate-400">{remaining > 0 ? `Resend in ${remaining}s` : 'Resend code'}</button><button type="button" disabled={busy} onClick={() => switchMode('register')} className="text-slate-500 hover:text-slate-800">Change email</button></div>}
        <div className="mt-9 flex items-center gap-3 border-t border-slate-200 pt-6 text-[11px] leading-5 text-slate-500"><svg className="shrink-0 text-violet-500" width="16" height="18" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 1L2 4v6c0 5 8 10 8 10s8-5 8-10V4L10 1Z"/><path d="m6 10 3 3 5-6"/></svg><span>Email verified accounts. Your design history stays private.</span></div>
      </div>
      <p className="text-center text-[10px] tracking-wide text-slate-400">FRAME TO CODE · BUILT FOR YOUR NEXT CHAPTER</p>
      {!superAdminRegistration && mode === 'login' && <a href="/super-admin/register" className="mt-3 text-center text-[10px] text-slate-400 underline-offset-4 hover:text-violet-700 hover:underline">Super Admin registration</a>}
    </section>
  </main>;
}
