import React from 'react';

export type DocIconType = 'doc' | 'list' | 'chart' | 'launch' | 'idea' | 'design' | 'work' | 'pin';

interface DocIconProps {
  type: string;
  size?: number;
  className?: string;
}

export function DocIcon({ type, size = 16, className = '' }: DocIconProps) {
  const strokeWidth = 2;
  
  switch (type) {
    case 'list':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="3.01" y1="6" y2="6" />
          <line x1="3" x2="3.01" y1="12" y2="12" />
          <line x1="3" x2="3.01" y1="18" y2="18" />
        </svg>
      );
    case 'chart':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      );
    case 'launch':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M14 9l-6 6" />
          <path d="M9 10l.5 1.5 1.5.5-1.5.5L9 14.5l-.5-1.5-1.5-.5 1.5-.5L9 10z" />
          <path d="M20 4s-4 1-6 3l-6 6c-1.5 1.5-1.5 4 0 5.5s4 1.5 5.5 0l6-6c2-2 3-6 3-6z" />
        </svg>
      );
    case 'idea':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6M10 22h4" />
        </svg>
      );
    case 'design':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.34735 19.4977 5.7337 20.103 6 20.764L6.5 22H7.5L8 20.764C8.2663 20.103 8.65265 19.4977 9.14143 19M12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19" />
          <circle cx="7.5" cy="10.5" r="1.5" />
          <circle cx="11.5" cy="7.5" r="1.5" />
          <circle cx="16.5" cy="9.5" r="1.5" />
          <circle cx="15.5" cy="14.5" r="1.5" />
        </svg>
      );
    case 'work':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'pin':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <line x1="12" x2="12" y1="17" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.32-2.9A2 2 0 0 1 15.8 9.86V5a3 3 0 0 0-6 0v4.86a2 2 0 0 1-.44 1.24l-2.32 2.9a2 2 0 0 0-.44 1.24Z" />
        </svg>
      );
    case 'doc':
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      );
  }
}
