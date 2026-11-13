import React from 'react';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  keys?: string[];
}

export const Kbd: React.FC<KbdProps> = ({ children, keys, className = '', ...props }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center gap-1 px-2 h-6 text-[11px] leading-none font-mono font-semibold text-zinc-300 bg-white/[0.05] border border-white/[0.1] rounded-md select-none ${className}`}
      {...props}
    >
      {keys?.map((k, i) => (
        <span key={i} className="leading-none">{k}</span>
      ))}
      {children}
    </kbd>
  );
};
