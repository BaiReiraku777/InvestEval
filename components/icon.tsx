const paths = {
  logo: "M3 17l5-5 4 3 8-9M15 6h5v5M3 5v14h18",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  cases: "M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zm3 5h8m-8 4h8m-8 4h5",
  compare: "M3 7h17m-4-4 4 4-4 4m5 6H4m4-4-4 4 4 4",
  grid: "M4 6h16M4 12h16M4 18h16M8 4v16",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  back: "M20 12H5m6 6-6-6 6-6",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  checked: "M20 11v8a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h10m-7 7 3 3 9-9",
  score: "M3 12h4l3-7 4 14 3-7h4",
  risk: "M10.3 4.8a2 2 0 013.4 0l7.4 12.3a2 2 0 01-1.7 3H4.6a2 2 0 01-1.7-3zM12 9v4m0 3v.1",
  clock: "M22 12a10 10 0 11-20 0 10 10 0 0120 0zM12 6v6l4 2",
  search: "M16 10a6 6 0 11-12 0 6 6 0 0112 0zm-1.5 4.5L21 21",
  calendar: "M4 6h16v14H4zM8 3v5m8-5v5M4 11h16",
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-2a5 5 0 015-5h6a5 5 0 015 5v2",
  evidence: "M20 6c0 2.2-3.6 4-8 4S4 8.2 4 6s3.6-4 8-4 8 1.8 8 4zM4 6v6c0 2.2 3.6 4 8 4s8-1.8 8-4V6M4 12v6c0 2.2 3.6 4 8 4s8-1.8 8-4v-6",
  context: "M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h4",
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
