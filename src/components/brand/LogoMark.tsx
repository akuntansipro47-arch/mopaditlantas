import React from 'react';

type Props = {
  className?: string;
};

export default function LogoMark({ className }: Props) {
  const bg = '#1E3A5F';
  const fg = '#FFFFFF';
  const frame = '#F8FAFC';

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OtoSmart"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill={frame} />
      <circle cx="32" cy="32" r="22" fill={bg} />

      <g transform="rotate(-45 32 32)">
        <rect x="29" y="14" width="6" height="16" rx="3" fill={fg} />
        <rect x="30" y="30" width="4" height="12" rx="2" fill={fg} />
        <path d="M32 46l-4-4h8l-4 4z" fill={fg} />
      </g>

      <g transform="rotate(45 32 32)">
        <rect x="29" y="20" width="6" height="28" rx="3" fill={fg} />
        <circle cx="32" cy="18" r="6.5" fill={fg} />
        <circle cx="34.4" cy="16.4" r="4.3" fill={bg} />
        <circle cx="32" cy="44.5" r="2.2" fill={bg} />
      </g>
    </svg>
  );
}
