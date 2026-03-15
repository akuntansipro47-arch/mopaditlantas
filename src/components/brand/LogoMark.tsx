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
      <circle cx="32" cy="32" r="21" fill={bg} />

      <g transform="rotate(-45 32 32)">
        <rect x="29" y="15" width="6" height="12" rx="3" fill={fg} />
        <rect x="30" y="27" width="4" height="16" rx="2" fill={fg} />
        <path d="M32 45l-4-4h8l-4 4z" fill={fg} />
      </g>

      <g transform="rotate(45 32 32)">
        <rect x="29" y="24" width="6" height="20" rx="3" fill={fg} />
        <circle cx="32" cy="22" r="7" fill={fg} />
        <circle cx="35" cy="19" r="4" fill={bg} />
      </g>
    </svg>
  );
}
