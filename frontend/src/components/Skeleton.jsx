export default function Skeleton({ lines = 6 }) {
  return (
    <div className="animate-pulse space-y-3 bg-white p-6" aria-busy="true" aria-label="Converting design">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 bg-zinc-200" style={{ width: `${95 - ((i * 17) % 45)}%` }} />
      ))}
    </div>
  );
}
