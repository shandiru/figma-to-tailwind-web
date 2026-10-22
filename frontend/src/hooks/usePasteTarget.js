import { useEffect, useRef } from 'react';
import { fileFromTransfer } from '../utils/clipboard.js';

/** Global Ctrl/Cmd+V handler that only fires while the zone is hovered or focused. */
export function usePasteTarget(onFile, onError) {
  const ref = useRef(null);
  const handler = useRef(onFile);
  handler.current = onFile;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    const el = ref.current;
    const onPaste = (e) => {
      const focusedZone = document.activeElement?.closest('[data-paste-zone]');
      if (focusedZone ? focusedZone !== el : !el.matches(':hover')) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
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
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  return ref;
}
