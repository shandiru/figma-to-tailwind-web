const paths = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  history: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  monitor: 'M3 3h18v14H3zM8 21h8m-4-4v4',
  phone: 'M7 2h10v20H7zM11 18h2',
  tablet: 'M4 2h16v20H4zM11 18h2',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  logout: 'M9 3H3v18h6m5-14 5 5-5 5m-6-5h11',
};
export default function StudioIcon({ name, size = 18, className = '' }) {
  return <svg width={size} height={size} className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"><path d={paths[name] || paths.grid}/></svg>;
}
