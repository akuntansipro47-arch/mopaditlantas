import React from 'react';

type Props = {
  className?: string;
};

export default function LogoMark({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OtoSmart"
      fill="none"
    >
      <rect x="6" y="6" width="52" height="52" rx="16" stroke="currentColor" strokeWidth="3" opacity="0.22" />

      <g opacity="0.95">
        <circle cx="32" cy="32" r="13" stroke="currentColor" strokeWidth="4.5" />
        <circle cx="32" cy="32" r="3" fill="currentColor" />

        <g fill="currentColor">
          <g transform="rotate(0 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(45 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(90 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(135 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(180 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(225 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(270 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
          <g transform="rotate(315 32 32)"><rect x="30" y="14" width="4" height="7" rx="2" /></g>
        </g>
      </g>

      <g stroke="#a3e635" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 44l22-22" />
        <circle cx="21" cy="44" r="3.6" />
        <path d="M46 18l-4.2 4.2" />
        <path d="M48.5 16.5a7 7 0 0 1-8.9 8.9" />
      </g>
    </svg>
  );
}
