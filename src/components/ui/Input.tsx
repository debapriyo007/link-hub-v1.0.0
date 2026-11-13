import React from 'react';
import { X } from 'lucide-react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  isClearable?: boolean;
  onClear?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  description,
  errorMessage,
  startContent,
  endContent,
  isClearable,
  onClear,
  size = 'md',
  className = '',
  value,
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const sizeContainer = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-11 px-3.5 text-sm',
    lg: 'h-13 px-4 text-base',
  }[size];

  return (
    <div className="flex flex-col gap-1 w-full text-left">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
          {label}
        </label>
      )}

      <div
        className={`relative flex items-center w-full rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus-within:border-[#ff9000] focus-within:ring-2 focus-within:ring-[#ff9000]/20 transition-all duration-200 ${sizeContainer} ${errorMessage ? '!border-red-500 !ring-red-500/20' : ''}`}
      >
        {startContent && (
          <div className="flex items-center text-slate-400 dark:text-zinc-500 mr-2 shrink-0">
            {startContent}
          </div>
        )}

        <input
          id={inputId}
          value={value}
          placeholder={placeholder}
          className={`w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none border-none p-0 ${className}`}
          {...props}
        />

        {isClearable && value && (
          <button
            type="button"
            onClick={onClear}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 ml-1 p-0.5 rounded-full"
            tabIndex={-1}
            aria-label="Clear input"
          >
            <X size={12} />
          </button>
        )}

        {endContent && (
          <div className="flex items-center text-slate-400 dark:text-zinc-500 ml-2 shrink-0">
            {endContent}
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="text-xs text-red-500 font-medium mt-0.5">{errorMessage}</p>
      )}
      {!errorMessage && description && (
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{description}</p>
      )}
    </div>
  );
};
