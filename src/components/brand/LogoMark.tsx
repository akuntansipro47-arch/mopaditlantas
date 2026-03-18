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
        <g stroke="#a3e635" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="20" r="6.5" />
          <g>
            <g transform="rotate(0 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(45 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(90 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(135 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(180 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(225 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(270 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
            <g transform="rotate(315 18 20)"><rect x="17" y="10.8" width="2" height="3.2" rx="1" fill="#a3e635" /></g>
          </g>
        </g>
      </g>

      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
        <path
          d="M16 38l3.2-7.2c.7-1.5 2.2-2.5 3.9-2.5h17.8c1.6 0 3.1.8 3.9 2.2L48 38"
          strokeWidth="4.5"
        />
        <path
          d="M12 38h40c2.2 0 4 1.8 4 4v6H8v-6c0-2.2 1.8-4 4-4Z"
          strokeWidth="4.5"
        />
        <path d="M26 28h12" strokeWidth="4.5" opacity="0.55" />
        <circle cx="20" cy="48" r="5.2" strokeWidth="4.5" />
        <circle cx="44" cy="48" r="5.2" strokeWidth="4.5" />
      </g>

      <path
        d="M42 18l7.5 7.5"
        stroke="#a3e635"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
