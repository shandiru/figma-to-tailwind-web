const tone = { info: 'bg-ink text-white', success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white' };

export default function Toasts({ toasts }) {
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-3 text-sm shadow-lg ${tone[t.type]}`}>{t.message}</div>
      ))}
    </div>
  );
}
