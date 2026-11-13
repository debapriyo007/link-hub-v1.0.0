import React from 'react';
import { X } from 'lucide-react';

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'solid' | 'bordered' | 'flat' | 'dot';
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'full' | 'lg' | 'md' | 'sm';
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  onClose?: () => void;
}

export const Chip: React.FC<ChipProps> = ({
  children,
  variant = 'flat',
  color = 'default',
  size = 'md',
  radius = 'full',
  startContent,
  endContent,
  onClose,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  }[size];

  const radiusClasses = {
    full: 'rounded-full',
    lg: 'rounded-lg',
    md: 'rounded-md',
    sm: 'rounded-sm',
  }[radius];

  let colorClasses = '';

  if (variant === 'flat') {
    switch (color) {
      case 'primary':
        colorClasses = 'bg-[#006FEE]/15 text-[#006FEE] dark:text-[#338ef7]';
        break;
      case 'secondary':
        colorClasses = 'bg-[#7828c8]/15 text-[#7828c8] dark:text-[#c084fc]';
        break;
      case 'success':
        colorClasses = 'bg-[#17c964]/15 text-[#17c964] dark:text-[#4ade80]';
        break;
      case 'warning':
        colorClasses = 'bg-[#f5a524]/15 text-[#c27b0f] dark:text-[#f5a524]';
        break;
      case 'danger':
        colorClasses = 'bg-[#f31260]/15 text-[#f31260] dark:text-[#f87171]';
        break;
      default:
        colorClasses = 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300';
    }
  } else if (variant === 'dot') {
    colorClasses = 'bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/60 text-slate-700 dark:text-zinc-300';
  } else if (variant === 'bordered') {
    switch (color) {
      case 'primary':
        colorClasses = 'border border-[#006FEE] text-[#006FEE]';
        break;
      default:
        colorClasses = 'border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300';
    }
  } else {
    switch (color) {
      case 'primary':
        colorClasses = 'bg-[#006FEE] text-white';
        break;
      default:
        colorClasses = 'bg-slate-800 text-white dark:bg-zinc-700';
    }
  }

  const dotColor = {
    primary: 'bg-[#006FEE]',
    secondary: 'bg-[#7828c8]',
    success: 'bg-[#17c964]',
    warning: 'bg-[#f5a524]',
    danger: 'bg-[#f31260]',
    default: 'bg-slate-400',
  }[color];

  return (
    <div
      className={`inline-flex items-center justify-center font-medium select-none ${sizeClasses} ${radiusClasses} ${colorClasses} ${className}`}
      {...props}
    >
      {variant === 'dot' && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      )}
      {startContent}
      <span>{children}</span>
      {endContent}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-0.5 hover:opacity-80 rounded-full p-0.5"
          aria-label="Remove"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
};
