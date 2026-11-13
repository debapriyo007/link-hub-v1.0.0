import React from 'react';

interface IncognitoIconProps {
  size?: number;
  className?: string;
}

export const IncognitoIcon: React.FC<IncognitoIconProps> = ({
  size = 16,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {/* Spy fedora crown */}
    <path d="M7 11l1.4-5.2A1.5 1.5 0 0 1 9.85 4.7h4.3a1.5 1.5 0 0 1 1.45 1.1L17 11" />
    {/* Wide hat brim */}
    <path d="M3 11h18" />
    {/* Incognito round glasses */}
    <circle cx="8" cy="16.5" r="2.75" />
    <circle cx="16" cy="16.5" r="2.75" />
    <path d="M10.75 16.5h2.5" />
  </svg>
);
