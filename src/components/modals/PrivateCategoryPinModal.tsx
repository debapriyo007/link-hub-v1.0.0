import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Delete, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
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
        className="relative z-10 w-full max-w-[340px] rounded-2xl bg-[#121318]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_28px_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] px-5 py-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel private unlock"
          className="absolute right-3.5 top-3.5 w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>

        {/* Prominent Category Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#ff9000]/12 border border-[#ff9000]/30 text-sm sm:text-base font-bold text-white mb-3">
          <CategoryIcon
            name={category.icon || category.slug}
            size={18}
            className="text-[#ff9000] shrink-0"
          />
          <span className="truncate max-w-[200px]">{formatCategoryName(category.name)}</span>
        </div>

        <h2 className="font-title font-bold text-base sm:text-lg text-white tracking-tight">
          Private Category Locked
        </h2>
        <p className="text-[11px] text-zinc-400 mt-0.5 mb-4">
          {verifying
            ? 'Deriving key & decrypting vault...'
            : 'Enter 6-digit private security code to decrypt links'}
        </p>

        {/* 6 Compact Circular Passcode Dots (No Glow Effect) */}
        <div className="flex items-center justify-center gap-2.5 mb-2.5">
          {Array.from({ length: 6 }).map((_, i) => {
            const isFilled = i < pin.length;
            return (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors duration-150 ${
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
          className="text-[11px] text-zinc-400 hover:text-[#ff9000] flex items-center gap-1 mb-4 transition-colors cursor-pointer"
        >
          {showNumbers ? <EyeOff size={12} /> : <Eye size={12} />}
          <span>{showNumbers ? 'Hide numbers' : 'Show numbers'}</span>
        </button>

        {error && <p className="text-[11px] text-red-400 font-semibold mb-2.5">{error}</p>}

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
            className="h-10 rounded-xl text-[11px] font-semibold text-zinc-400 hover:text-white active:scale-95 transition-all flex items-center justify-center cursor-pointer"
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

          {/* Bottom Right: Backspace Icon */}
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Backspace"
            className="h-10 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
