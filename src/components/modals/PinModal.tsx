import React, { useState, useEffect, useCallback } from 'react';
import { playRetroClick, playRetroUnlockChime } from '../../utils/sound.ts';
import { LinkHubLogo } from '../LinkHubLogo.tsx';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePin: (pin: string | null) => void;
  currentPin: string | null;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onSavePin,
  currentPin,
}) => {
  const [pin, setPin] = useState('');
  const [showNumbers, setShowNumbers] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setShowNumbers(false);
    }
  }, [isOpen]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 6) return;
      playRetroClick();
      const nextPin = pin + digit;
      setPin(nextPin);

      if (nextPin.length === 6) {
        setTimeout(() => {
          playRetroUnlockChime();
          onSavePin(nextPin);
          onClose();
        }, 120);
      }
    },
    [pin, onSavePin, onClose]
  );

  const handleDelete = useCallback(() => {
    if (pin.length === 0) return;
    playRetroClick();
    setPin((prev) => prev.slice(0, -1));
  }, [pin.length]);

  const handleClear = useCallback(() => {
    playRetroClick();
    setPin('');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDigit, handleDelete, onClose]);

  if (!isOpen) return null;

  const handleRemovePin = () => {
    playRetroClick();
    onSavePin(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Frosted Dark Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Home-Screen-Lock Style Minimal Dark Glass Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={currentPin ? 'Change Security PIN' : 'Set Security PIN'}
        className="w-full max-w-[330px] rounded-2xl bg-[#121318]/85 backdrop-blur-xl border border-white/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] px-5 py-6 flex flex-col items-center text-center relative z-10 animate-in zoom-in-95 duration-150"
      >
        {/* Brand Logo */}
        <div className="mb-4">
          <LinkHubLogo size="md" />
        </div>

        {/* Minimal Title & Subtitle */}
        <h2 className="font-title font-bold text-base sm:text-lg text-white tracking-tight mb-1">
          {currentPin ? 'Change Security PIN' : 'Set Security PIN'}
        </h2>
        <p className="text-[11px] text-zinc-400 mb-4">
          Enter 6-digit PIN to save
        </p>

        {/* 6 Compact Circular Passcode Dots (Matching Home Lock Screen) */}
        <div className="flex items-center justify-center gap-2.5 mb-2.5">
          {Array.from({ length: 6 }).map((_, i) => {
            const isFilled = i < pin.length;
            return (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors duration-150 ${
                  isFilled
                    ? 'bg-[#ff9000] border border-[#ff9000] text-black'
                    : 'bg-white/[0.04] border border-white/[0.15]'
                }`}
              >
                {isFilled && showNumbers ? pin[i] : ''}
              </div>
            );
          })}
        </div>

        {/* Minimal Text Show/Hide Numbers Toggle (No Icon, No Background) */}
        <button
          type="button"
          onClick={() => setShowNumbers(!showNumbers)}
          className="text-[11px] text-zinc-400 hover:text-white mb-4 transition-colors cursor-pointer"
        >
          {showNumbers ? 'Hide numbers' : 'Show numbers'}
        </button>

        {/* Compact 3x4 Subtle Glass Keypad Grid */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-10 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.14] active:bg-[#ff9000] active:text-black active:scale-95 text-sm font-bold text-white transition-all flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Bottom Left: Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-10 rounded-xl text-[11px] font-medium text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            Clear
          </button>

          {/* Bottom Center: 0 */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-10 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.14] active:bg-[#ff9000] active:text-black active:scale-95 text-sm font-bold text-white transition-all flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          {/* Bottom Right: Delete (Minimal Text, No Icon) */}
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Backspace"
            className="h-10 rounded-xl text-[11px] font-medium text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            Delete
          </button>
        </div>

        {/* Minimal Bottom Text Actions (No Icons, No Colored Backgrounds) */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] font-medium text-zinc-400">
          <button
            type="button"
            onClick={onClose}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {currentPin && (
            <>
              <span className="text-white/15">•</span>
              <button
                type="button"
                onClick={handleRemovePin}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Remove PIN
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
