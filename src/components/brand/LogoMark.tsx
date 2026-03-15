import React from 'react';

type Props = {
  className?: string;
};

export default function LogoMark({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="OtoSmart"
    >
      <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="4" />
      <path
        d="M32 6v7M32 51v7M6 32h7M51 32h7M14 14l5 5M45 45l5 5M50 14l-5 5M19 45l-5 5"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M22 22l20 20M18 26l4-4 4-4M38 46l4-4 4-4"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="2.5" fill="currentColor" />
    </svg>
  );
}

