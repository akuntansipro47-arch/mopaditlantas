import React from 'react';

type Props = {
  className?: string;
};

export default function LogoMark({ className }: Props) {
  const bg = '#1E3A5F';
  const fg = '#FFFFFF';
  const frame = '#FFFFFF';
  const frameStroke = '#E2E8F0';

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OtoSmart"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill={frame} stroke={frameStroke} strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill={bg} />

      <g stroke={fg} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <g transform="rotate(-45 32 32)">
          <path d="M30 16h4v10h-4z" fill={fg} stroke="none" />
          <path d="M32 26v18" />
          <path d="M32 44l-3-3h6l-3 3z" fill={fg} stroke="none" />
          <path d="M30 16h4" />
        </g>

        <g transform="rotate(45 32 32)">
          <path d="M30 20h4v20h-4z" fill={fg} stroke="none" />
          <path d="M34 18a6 6 0 1 1-4-4" />
          <circle cx="32" cy="18" r="5.5" />
          <circle cx="34.5" cy="16.5" r="3.4" stroke={bg} strokeWidth="6" />
        </g>

        <path d="M45.5 41.5l2.2 2.2" />
        <path d="M49.5 39.5l-2.2-2.2" />
        <path d="M46.5 38.5l6 6" />
      </g>

      <path
        d="M46.5 45.2l3.2-1.9 3.2 1.9v3.6l-3.2 1.9-3.2-1.9v-3.6z"
        fill={fg}
        opacity="0.95"
      />
    </svg>
  );
}
