// The Presafe mark: a ticket stub with side notches, a perforation line and a check.
export function StubMark({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 40 28" aria-hidden="true">
      <path
        d="M4 1h32a3 3 0 0 1 3 3v6a4 4 0 0 0 0 8v6a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-6a4 4 0 0 0 0-8V4a3 3 0 0 1 3-3z"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
      <line x1="28" y1="4" x2="28" y2="24" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
      <path d="M9 14.5l3.5 3.5L20 10.5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <StubMark size={26} />
      presafe
    </span>
  );
}
