import { useEffect, useRef, useState } from 'react';
import { pasteFigmaClipboard } from '../services/api.js';
import { clipboardInput, clipboardProblem, readOriginalClipboard, snapshotTransfer } from '../utils/nativeClipboard.js';

export default function ClipboardPaste({ enabled, disabled, onBusy, onPasted, layout = 'desktop' }) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [received, setReceived] = useState(null);
  const inFlight = useRef(false);
  const callbacks = useRef({ onBusy, onPasted });
  callbacks.current = { onBusy, onPasted };
  const receive = async (snapshot, recover = false) => {
    if (inFlight.current || disabled) return;
    setError('');
    inFlight.current = true; setReading(true); callbacks.current.onBusy(true);
    try {
      const inspect = () => {
        setReceived({ types: snapshot.types, characters: snapshot.values.reduce((sum, value) => sum + value.length, 0) });
        if (snapshot.values.some(value => value.length > 48 * 1024 * 1024)) throw new Error('Copy a smaller selection (under 48 MB).');
        return clipboardInput(snapshot.values);
      };
      let input = inspect();
      if (!input && recover && navigator.clipboard?.read) {
        try {
          const original = await readOriginalClipboard(navigator.clipboard);
          snapshot = { types: [...new Set([...snapshot.types, ...original.types])], values: [...snapshot.values, ...original.values] };
        } catch { /* Keep the actual event formats when permission/support is absent. */ }
        input = inspect();
      }
      if (!input) throw new Error(clipboardProblem(snapshot));
      const pasted = await pasteFigmaClipboard(input);
      // Retain a sample only in this tab for an explicit, user-initiated download.
      callbacks.current.onPasted({ ...pasted, ...(input.html && pasted.design.issues?.length ? { clipboardSample: input.html } : {}) });
    }
    catch (err) { setError(err.message); }
    finally { inFlight.current = false; setReading(false); callbacks.current.onBusy(false); }
  };
  const receiver = useRef(receive);
  receiver.current = receive;
  useEffect(() => {
    if (!enabled) return;
    const paste = event => {
      if (disabled || event.target.closest?.('input,textarea,[contenteditable="true"]')) return;
      const snapshot = snapshotTransfer(event.clipboardData);
      event.preventDefault(); receiver.current(snapshot, true);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [enabled, disabled]);
  const readClipboard = async () => {
    setError('');
    try {
      await receive(await readOriginalClipboard(navigator.clipboard));
    } catch (err) { setError(err.name === 'NotAllowedError' ? 'Clipboard access was not granted. Click the paste area and press Ctrl/Cmd+V.' : err.message); }
  };
  return <div>
    <button type="button" disabled={disabled || reading} onClick={readClipboard} className="paste-zone w-full focus:border-violet-500 focus:bg-violet-50/50" aria-label="Paste copied Figma design">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-xl text-violet-600" aria-hidden="true">▧</span>
      <span className="text-sm font-semibold text-slate-800">{reading ? 'Reading your Figma layers…' : `Paste your ${layout} design`}</span>
      <span className="mt-2 text-xs leading-6 text-slate-500">Select a frame in Figma and copy.<br/>Come here and press <kbd>Ctrl / Cmd + V</kbd></span>
      <span className="mt-4 text-[11px] font-medium text-violet-600">{reading ? 'Preparing your section canvas' : 'Or click to paste from clipboard'}</span>
    </button>
    <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>No link, token or JSON file needed</div>
    {error && <div className="mt-3 space-y-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700"><p role="alert">{error}</p><button type="button" disabled={disabled || reading} onClick={readClipboard} className="rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-50">Read original clipboard</button>{received && <p className="break-words text-[10px] text-slate-600">Received formats: {received.types.join(', ') || 'none'} · {received.characters.toLocaleString()} text characters. Design contents are not logged.</p>}</div>}
  </div>;
}
