import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Delete } from 'lucide-react';
import { Category } from '../../types.ts';
import { formatCategoryName } from '../../utils/vaultLogic.ts';
import { verifyPrivateCategoryPinAsync } from '../../utils/privateVaultCrypto.ts';
import { playRetroClick, playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { CategoryIcon } from '../CategoryIcon.tsx';

interface PrivateCategoryPinModalProps {
  isOpen: boolean;
  userId: string;
  category: Category | null;
  onClose: () => void;
  onUnlockSuccess: (category: Category, enteredPin: string) => Promise<void> | void;
}

export const PrivateCategoryPinModal: React.FC<PrivateCategoryPinModalProps> = ({
  isOpen,
  userId,
  category,
  onClose,
  onUnlockSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [showNumbers, setShowNumbers] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setShowNumbers(false);
      setVerifying(false);
    }
  }, [isOpen, category?.id]);

  const handleDigit = useCallback(
    async (digit: string) => {
      if (!category || verifying || pin.length >= 6) return;
      playRetroClick();
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');

      if (nextPin.length === 6) {
        setVerifying(true);
        try {
          const isValid = await verifyPrivateCategoryPinAsync(nextPin, category, userId);
          if (isValid) {
            playRetroUnlockChime();
            await onUnlockSuccess(category, nextPin);
          } else {
            playRetroBeep();
            setError('Incorrect private security code. Try again.');
            setTimeout(() => {
              setPin('');
            }, 380);
          }
        } catch {
          playRetroBeep();
          setError('Could not verify private vault code.');
          setPin('');
        } finally {
          setVerifying(false);
        }
      }
    },
    [pin, category, userId, verifying, onUnlockSuccess]
  );

  const handleClear = useCallback(() => {
    if (verifying) return;
    playRetroClick();
    setPin('');
    setError('');
  }, [verifying]);

  const handleDelete = useCallback(() => {
    if (verifying || pin.length === 0) return;
    playRetroClick();
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, [pin.length, verifying]);

  useEffect(() => {
    if (!isOpen || !category) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        void handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, category, handleDigit, handleDelete, onClose]);

  if (!isOpen || !category) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Frosted Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Lock Screen Style Security Code Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Unlock ${formatCategoryName(category.name)}`}
        className="relative z-10 w-full max-w-[372px] sm:max-w-[330px] rounded-2xl bg-[#121318]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_28px_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] px-6 py-7 sm:px-5 sm:py-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
      >
        {/* Clean Unboxed Category Heading */}
        <div className="w-full flex items-center justify-center gap-2 mb-1.5 sm:mb-1">
          <CategoryIcon
            name={category.icon || category.slug}
            size={18}
            className="text-[#ff9000] shrink-0"
          />
          <h2 className="font-title font-bold text-lg sm:text-base text-white tracking-tight truncate">
            {formatCategoryName(category.name)}
          </h2>
        </div>

        <p className="text-xs sm:text-[11px] text-zinc-400 mb-6 sm:mb-4">
          {verifying ? 'Unlocking vault...' : 'Enter 6-digit security code'}
        </p>

        {/* 6 Compact Circular Passcode Dots */}
        <div className="flex items-center justify-center gap-3 sm:gap-2.5 mb-3.5 sm:mb-2.5">
          {Array.from({ length: 6 }).map((_, i) => {
            const isFilled = i < pin.length;
            return (
              <div
                key={i}
                className={`w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full flex items-center justify-center text-[10px] sm:text-[9px] font-bold tabular-nums transition-colors duration-150 ${
                  error
                    ? 'bg-red-500 border border-red-400 text-white'
                    : isFilled
                      ? 'bg-[#ff9000] border border-[#ff9000] text-black'
                      : 'bg-white/[0.04] border border-white/[0.15]'
                }`}
              >
                {isFilled && showNumbers ? pin[i] : ''}
              </div>
            );
          })}
        </div>

        {/* Show numbers toggle */}
        <button
          type="button"
          onClick={() => setShowNumbers(!showNumbers)}
          className="text-xs sm:text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 sm:gap-1 mb-6 sm:mb-4 transition-colors cursor-pointer"
        >
          {showNumbers ? (
            <EyeOff className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          ) : (
            <Eye className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          )}
          <span>{showNumbers ? 'Hide numbers' : 'Show numbers'}</span>
        </button>

        {error && <p className="text-xs sm:text-[11px] text-red-400 font-medium mb-3.5 sm:mb-2.5">{error}</p>}

        {/* Responsive 3x4 Subtle Glass Keypad Grid */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-2 w-full max-w-[290px] sm:max-w-[240px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-13 sm:h-10 rounded-2xl sm:rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.14] active:bg-[#ff9000] active:text-black active:scale-95 text-base sm:text-sm font-bold tabular-nums text-white transition-all flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Bottom Left: Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-13 sm:h-10 rounded-2xl sm:rounded-xl text-xs sm:text-[11px] font-medium text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            Clear
          </button>

          {/* Bottom Center: 0 */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 sm:h-10 rounded-2xl sm:rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.14] active:bg-[#ff9000] active:text-black active:scale-95 text-base sm:text-sm font-bold tabular-nums text-white transition-all flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          {/* Bottom Right: Backspace Icon */}
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Backspace"
            className="h-13 sm:h-10 rounded-2xl sm:rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-[17px] h-[17px] sm:w-[15px] sm:h-[15px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
