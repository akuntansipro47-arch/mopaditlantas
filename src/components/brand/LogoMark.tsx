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
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
      <circle cx="32" cy="32" r="21" fill="#1e3a5f" />

      <g fill="#ffffff">
        <g transform="rotate(0 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(45 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(90 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(135 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(180 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(225 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(270 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
        <g transform="rotate(315 32 32)"><rect x="30" y="9" width="4" height="7" rx="2" /></g>
      </g>
      <circle cx="32" cy="32" r="14" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.95" />

      <circle cx="26" cy="34" r="6.5" fill="none" stroke="#ffffff" strokeWidth="4" />
      <path
        d="M42 28c-2.3-1.6-5.7-1.4-7.2 0.3-1.1 1.2-0.8 3 0.5 3.8 1.7 1 6.4 0.8 6.4 4.2 0 3.8-5.3 5.2-8.2 2.7"
        fill="none"
        stroke="#a3e635"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
