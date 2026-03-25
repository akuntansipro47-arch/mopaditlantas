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
      aria-label="Monitoring Pagu"
      fill="none"
    >
      <rect x="5" y="5" width="54" height="54" rx="16" fill="#0b1220" />
      <rect x="6" y="6" width="52" height="52" rx="16" stroke="#334155" strokeWidth="2" />
      <path
        d="M18 44V20L32 34L46 20V44"
        stroke="#e2e8f0"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="44" r="3.5" fill="#a3e635" />
    </svg>
  );
}
