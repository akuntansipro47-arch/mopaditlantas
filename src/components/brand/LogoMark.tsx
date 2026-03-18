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
      <rect x="5" y="5" width="54" height="54" rx="16" fill="#0b1220" />
      <rect x="6" y="6" width="52" height="52" rx="16" stroke="#334155" strokeWidth="2" />

      <g fill="#e2e8f0" opacity="0.98">
        <circle cx="32" cy="32" r="15" />
        <g>
          <g transform="rotate(0 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(30 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(60 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(90 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(120 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(150 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(180 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(210 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(240 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(270 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(300 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
          <g transform="rotate(330 32 32)"><rect x="30" y="9" width="4" height="8" rx="2" /></g>
        </g>
      </g>

      <circle cx="32" cy="32" r="9" fill="#0b1220" />
      <circle cx="32" cy="32" r="3" fill="#e2e8f0" opacity="0.95" />

      <g stroke="#a3e635" strokeLinecap="round" strokeLinejoin="round" opacity="0.98">
        <path d="M19 45l22-22" strokeWidth="5" />
        <path d="M44 19l4.5 4.5" strokeWidth="5" />
        <path d="M48.8 16.2a8 8 0 0 1-10.1 10.1" strokeWidth="3.5" />
        <circle cx="19" cy="45" r="3.8" strokeWidth="4.5" />
        <path d="M16.7 47.3l4.6-4.6" strokeWidth="3" opacity="0.6" />
      </g>
    </svg>
  );
}
