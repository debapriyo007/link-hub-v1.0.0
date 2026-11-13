import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'flat' | 'bordered' | 'light' | 'ghost';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'default';
  size?: 'sm' | 'md' | 'lg';
  radius?: 'full' | 'xl' | 'lg' | 'md' | 'none';
  isIconOnly?: boolean;
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'solid',
  color = 'primary',
  size = 'md',
  radius = 'xl',
  isIconOnly = false,
  startContent,
  endContent,
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  // Size classes
  const sizeClasses = {
    sm: isIconOnly ? 'w-8 h-8 p-0 text-xs' : 'px-3 py-1.5 text-xs gap-1.5',
    md: isIconOnly ? 'w-10 h-10 p-0 text-sm' : 'px-4 py-2 text-sm gap-2',
    lg: isIconOnly ? 'w-12 h-12 p-0 text-base' : 'px-6 py-2.5 text-base gap-2.5',
  }[size];

  // Radius classes
  const radiusClasses = {
    full: 'rounded-full',
    xl: 'rounded-xl',
    lg: 'rounded-lg',
    md: 'rounded-md',
    none: 'rounded-none',
  }[radius];

  // Variant & Color combinations matching HeroUI
  let colorVariantClasses = '';

  if (variant === 'solid') {
    switch (color) {
      case 'primary':
        colorVariantClasses = 'bg-[#ff9000] hover:bg-[#ffa31a] active:bg-[#e07f00] text-black font-bold shadow-sm shadow-[#ff9000]/25';
        break;
      case 'secondary':
        colorVariantClasses = 'bg-zinc-800 hover:bg-zinc-700 text-white';
        break;
      case 'success':
        colorVariantClasses = 'bg-[#17c964] hover:bg-[#13a853] text-white shadow-sm';
        break;
      case 'warning':
        colorVariantClasses = 'bg-[#ff9000] hover:bg-[#ffa31a] text-black shadow-sm';
        break;
      case 'danger':
        colorVariantClasses = 'bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-sm';
        break;
      default:
        colorVariantClasses = 'bg-zinc-800 hover:bg-zinc-700 text-white shadow-sm border border-zinc-700';
    }
  } else if (variant === 'flat') {
    switch (color) {
      case 'primary':
        colorVariantClasses = 'bg-[#ff9000]/15 hover:bg-[#ff9000]/25 text-[#ff9000] font-semibold';
        break;
      case 'secondary':
        colorVariantClasses = 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200';
        break;
      case 'success':
        colorVariantClasses = 'bg-[#17c964]/15 hover:bg-[#17c964]/25 text-[#17c964]';
        break;
      case 'warning':
        colorVariantClasses = 'bg-[#ff9000]/15 hover:bg-[#ff9000]/25 text-[#ff9000]';
        break;
      case 'danger':
        colorVariantClasses = 'bg-[#ef4444]/15 hover:bg-[#ef4444]/25 text-[#ef4444]';
        break;
      default:
        colorVariantClasses = 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200';
    }
  } else if (variant === 'bordered') {
    switch (color) {
      case 'primary':
        colorVariantClasses = 'border border-[#ff9000] hover:bg-[#ff9000]/10 text-[#ff9000] font-semibold';
        break;
      case 'danger':
        colorVariantClasses = 'border border-[#ef4444] hover:bg-[#ef4444]/10 text-[#ef4444]';
        break;
      default:
        colorVariantClasses = 'border border-zinc-700 hover:bg-zinc-800/60 text-zinc-300';
    }
  } else if (variant === 'light') {
    switch (color) {
      case 'primary':
        colorVariantClasses = 'hover:bg-[#ff9000]/15 text-[#ff9000]';
        break;
      case 'danger':
        colorVariantClasses = 'hover:bg-[#f31260]/10 text-[#f31260]';
        break;
      default:
        colorVariantClasses = 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300';
    }
  }

  const displayClass = className.includes('hidden') ? '' : 'inline-flex';

  return (
    <button
      disabled={disabled || isLoading}
      className={`relative ${displayClass} items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed ${sizeClasses} ${radiusClasses} ${colorVariantClasses} ${className}`}
      {...props}
    >
      {isLoading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
      )}
      {!isLoading && startContent}
      {children}
      {!isLoading && endContent}
    </button>
  );
};
