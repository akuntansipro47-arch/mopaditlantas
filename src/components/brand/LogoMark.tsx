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
      <circle cx="22" cy="36" r="9.5" stroke="currentColor" strokeWidth="5" />
      <circle cx="22" cy="36" r="2.6" fill="currentColor" />
      <path
        d="M48 24c-3.4-3-9.5-3.1-12.8 0c-2.2 2.1-1.5 5.4 1.7 6.6c3.2 1.2 10.2 1 10.2 7.1c0 5.9-8.1 8.2-14 5"
        stroke="#a3e635"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
