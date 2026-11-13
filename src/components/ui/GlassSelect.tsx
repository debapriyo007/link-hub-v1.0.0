import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { playRetroClick } from '../../utils/sound.ts';

export interface GlassSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GlassSelectOption[];
  ariaLabel?: string;
  prefixLabel?: string;
  startIcon?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  align?: 'left' | 'right';
  direction?: 'down' | 'up';
}

export const GlassSelect: React.FC<GlassSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  prefixLabel,
  startIcon,
  size = 'md',
  className = '',
  align = 'left',
  direction = 'down',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
          playRetroClick();
          setOpen((prev) => !prev);
        }}
        className={`w-full flex items-center justify-between gap-2 rounded-xl glass-input backdrop-blur-xl transition-all cursor-pointer text-left ${
          size === 'sm' ? 'h-8 px-2.5 text-[11px]' : 'h-10 px-3.5 text-xs'
        } ${
          open
            ? 'border-[#ff9000]/60 bg-white/[0.09] ring-2 ring-[#ff9000]/20 text-white'
            : 'hover:bg-white/[0.08] text-zinc-100'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {(selectedOption?.icon || startIcon) && (
            <span className="text-[#ff9000] shrink-0 flex items-center">
              {selectedOption?.icon || startIcon}
            </span>
          )}
          {prefixLabel && (
            <span className="text-zinc-400 font-semibold uppercase tracking-wider shrink-0">
              {prefixLabel}
            </span>
          )}
          <span
            className={`truncate ${
              size === 'sm' ? 'font-semibold tracking-wide text-zinc-100' : 'font-medium text-white'
            }`}
          >
            {selectedOption?.label || value}
          </span>
        </div>
        <ChevronDown
          size={size === 'sm' ? 12 : 14}
          className={`shrink-0 text-zinc-400 transition-transform duration-200 ${
            open ? 'rotate-180 text-[#ff9000]' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
            direction === 'up' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          } ${
            size === 'sm'
              ? 'min-w-[165px] w-max max-w-[calc(100vw-1.5rem)] sm:max-w-xs'
              : 'w-full min-w-[200px] max-w-full'
          } bg-[#15151c]/95 backdrop-blur-2xl border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.88)] rounded-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto overscroll-contain`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  playRetroClick();
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#ff9000]/15 text-[#ff9000] font-semibold'
                    : 'text-zinc-200 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  {opt.icon && (
                    <span
                      className={`shrink-0 ${
                        isSelected ? 'text-[#ff9000]' : 'text-zinc-400'
                      }`}
                    >
                      {opt.icon}
                    </span>
                  )}
                  <span
                    className={`truncate ${
                      size === 'sm' ? 'tracking-wide text-[11px]' : ''
                    }`}
                  >
                    {opt.label}
                  </span>
                </span>
                {isSelected && <Check size={13} className="text-[#ff9000] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
