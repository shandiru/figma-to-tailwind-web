import { useEffect, useRef } from 'react';
import { fileFromTransfer } from '../utils/clipboard.js';

/** Global Ctrl/Cmd+V handler that only fires while the zone is hovered or focused. */
export function usePasteTarget(onFile, onError) {
  const ref = useRef(null);
  const active = useRef(false);
  const handler = useRef(onFile);
  handler.current = onFile;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    const el = ref.current;
    const on = () => (active.current = true);
    const off = () => (active.current = false);
    const onPaste = (e) => {
      if (!active.current) return;
      try {
        const file = fileFromTransfer(e.clipboardData);
        if (file) {
          e.preventDefault();
          handler.current(file);
        }
      } catch (err) {
        e.preventDefault();
        errorHandler.current?.(err.message);
      }
    };
    el.addEventListener('mouseenter', on);
    el.addEventListener('focus', on);
    el.addEventListener('mouseleave', off);
    el.addEventListener('blur', off);
    document.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('mouseenter', on);
      el.removeEventListener('focus', on);
      el.removeEventListener('mouseleave', off);
      el.removeEventListener('blur', off);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  return ref;
}
