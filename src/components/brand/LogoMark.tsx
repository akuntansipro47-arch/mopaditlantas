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
      <rect x="6" y="6" width="52" height="52" rx="18" fill="url(#bg)" />
      <rect x="7.5" y="7.5" width="49" height="49" rx="16.5" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <path
        d="M18 24.5C18 21.4624 20.4624 19 23.5 19H40.5C43.5376 19 46 21.4624 46 24.5V39.5C46 42.5376 43.5376 45 40.5 45H23.5C20.4624 45 18 42.5376 18 39.5V24.5Z"
        fill="rgba(255,255,255,0.06)"
      />
      <path
        d="M24 39V25L32 33L40 25V39"
        stroke="#F8FAFC"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 18.5L27 14H37L41 18.5"
        stroke="#A3E635"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="42.5" cy="41.5" r="3" fill="#A3E635" />
      <defs>
        <linearGradient id="bg" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#111827" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
      </defs>
    </svg>
  );
}
