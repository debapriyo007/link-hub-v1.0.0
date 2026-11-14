import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'sm',
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    xs: 'max-w-[360px]',
    sm: 'max-w-[400px]',
    md: 'max-w-[480px]',
    lg: 'max-w-[540px]',
    xl: 'max-w-[620px]',
    '2xl': 'max-w-[680px]',
  }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      {/* Industry-standard Frosted Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Proportionally Balanced Modal Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${sizeClasses} rounded-2xl bg-[#111216]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_28px_80px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.09)] overflow-hidden z-10 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90dvh] ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export const ModalHeader: React.FC<{
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}> = ({ children, onClose, className = '' }) => (
  <div
    className={`px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0 ${className}`}
  >
    <div className="text-sm font-title font-bold text-white tracking-tight min-w-0 truncate">
      {children}
    </div>
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        className="w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer shrink-0"
        aria-label="Close modal"
      >
        <X size={15} />
      </button>
    )}
  </div>
);

export const ModalBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`px-4 sm:px-5 py-4 flex-1 overflow-y-auto overscroll-contain max-h-[72dvh] ${className}`}>
    {children}
  </div>
);

export const ModalFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  const justifyClass = className.includes('justify-') ? '' : 'justify-end';
  return (
    <div
      className={`px-4 sm:px-5 py-3 border-t border-white/[0.07] bg-[#0c0d10]/85 flex items-center flex-wrap ${justifyClass} gap-2.5 shrink-0 ${className}`}
    >
      {children}
    </div>
  );
};
