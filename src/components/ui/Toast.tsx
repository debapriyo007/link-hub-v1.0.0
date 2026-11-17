import React from 'react';
import { Check, X } from 'lucide-react';

export type ToastVariant =
  | 'success'
  | 'error'
  | 'info'
  | 'warning'
  | 'security'
  | 'copy'
  | 'delete';

export interface ToastData {
  id: number;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastProps {
  toast: ToastData | null;
  onDismiss: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

type CoreVariant = 'success' | 'error' | 'info' | 'warning';

function normalizeVariant(variant: ToastVariant): CoreVariant {
  switch (variant) {
    case 'copy':
      return 'success';
    case 'delete':
      return 'warning';
    case 'security':
      return 'info';
    default:
      return variant;
  }
}

function inferToastVariant(message: string): CoreVariant {
  const lower = message.toLowerCase();

  if (
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('invalid') ||
    lower.includes('incorrect') ||
    lower.includes('unable') ||
    lower.includes('could not')
  ) {
    return 'error';
  }

  if (
    lower.includes('keep at least') ||
    lower.includes('must remain') ||
    lower.includes('cannot') ||
    lower.includes('deleted') ||
    lower.includes('removed') ||
    lower.includes('warning')
  ) {
    return 'warning';
  }

  if (
    lower.includes('locked') ||
    lower.includes('signed out') ||
    lower.includes('pin') ||
    lower.includes('info') ||
    lower.includes('settings')
  ) {
    return 'info';
  }

  return 'success';
}

function ensureExclamation(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return 'Done!';
  if (trimmed.endsWith('!')) return trimmed;
  return `${trimmed.replace(/[.]+$/, '')}!`;
}

const CORE_STYLES: Record<
  CoreVariant,
  {
    title: string;
    stripColor: string;
    circleBg: string;
    iconContrast: string;
    ambientTint: string;
    borderTint: string;
  }
> = {
  success: {
    title: 'Success',
    stripColor: 'bg-[#47D764]',
    circleBg: 'bg-[#47D764]',
    iconContrast: 'text-[#071a0b]',
    ambientTint: 'radial-gradient(220px circle at 0% 50%, rgba(71, 215, 100, 0.14), transparent 72%)',
    borderTint: 'border-white/[0.11]',
  },
  error: {
    title: 'Error',
    stripColor: 'bg-[#FF355B]',
    circleBg: 'bg-[#FF355B]',
    iconContrast: 'text-white',
    ambientTint: 'radial-gradient(220px circle at 0% 50%, rgba(255, 53, 91, 0.16), transparent 72%)',
    borderTint: 'border-[#FF355B]/25',
  },
  info: {
    title: 'Info',
    stripColor: 'bg-[#ff9000]',
    circleBg: 'bg-[#ff9000]',
    iconContrast: 'text-black',
    ambientTint: 'radial-gradient(220px circle at 0% 50%, rgba(255, 144, 0, 0.16), transparent 72%)',
    borderTint: 'border-[#ff9000]/25',
  },
  warning: {
    title: 'Warning',
    stripColor: 'bg-[#ff9000]',
    circleBg: 'bg-[#ff9000]',
    iconContrast: 'text-black',
    ambientTint: 'radial-gradient(220px circle at 0% 50%, rgba(255, 144, 0, 0.16), transparent 72%)',
    borderTint: 'border-[#ff9000]/25',
  },
};

function renderSolidCircleGlyph(variant: CoreVariant) {
  switch (variant) {
    case 'success':
      return <Check size={15} strokeWidth={3} />;
    case 'error':
      return <X size={14} strokeWidth={3} />;
    case 'info':
      return (
        <span
          aria-hidden="true"
          className="font-sans font-extrabold text-[14px] leading-none select-none"
        >
          i
        </span>
      );
    case 'warning':
      return (
        <span
          aria-hidden="true"
          className="font-sans font-black text-[15px] leading-none select-none"
        >
          !
        </span>
      );
  }
}

export const Toast: React.FC<ToastProps> = ({
  toast,
  onDismiss,
  onPause,
  onResume,
}) => {
  if (!toast) return null;

  const coreVariant = toast.variant
    ? normalizeVariant(toast.variant)
    : inferToastVariant(toast.message);
  const style = CORE_STYLES[coreVariant];
  const formattedMessage = ensureExclamation(toast.message);

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-5 sm:right-5 z-[110] sm:w-[348px] pointer-events-none"
    >
      <div
        className={`toast-enter pointer-events-auto relative overflow-hidden rounded-[14px] bg-gradient-to-br from-[#1b1b22]/96 via-[#131318]/95 to-[#0d0d11]/96 backdrop-blur-2xl border ${style.borderTint} shadow-[0_20px_50px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.1)] pl-4 pr-3 py-2.5 sm:pl-5 sm:pr-3.5 sm:py-3 flex items-center gap-3`}
      >
        {/* Subtle Theme-Matched Ambient Glow */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: style.ambientTint }}
        />

        {/* Left Solid Colored Vertical Accent Bar */}
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0 bottom-0 w-[6px] ${style.stripColor}`}
        />

        {/* Solid Colored Circular Icon */}
        <div
          className={`relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full ${style.circleBg} ${style.iconContrast} flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.35)]`}
        >
          {renderSolidCircleGlyph(coreVariant)}
        </div>

        {/* Title + Short Message */}
        <div className="relative z-10 min-w-0 flex-1">
          <div className="font-title text-[13.5px] sm:text-[14.5px] font-bold text-white leading-tight tracking-[-0.01em]">
            {style.title}
          </div>
          <p className="text-[12px] sm:text-[13px] font-medium text-zinc-300 leading-snug mt-0.5 truncate">
            {formattedMessage}
          </p>
        </div>

        {/* Vertically Centered Close Button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="relative z-10 w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};
