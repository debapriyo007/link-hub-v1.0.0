import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Eye, EyeOff, Delete, ArrowLeft, KeyRound } from 'lucide-react';
import { BsPersonLock } from 'react-icons/bs';
import { playRetroClick, playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { LinkHubLogo } from '../LinkHubLogo.tsx';
import { ToastVariant } from '../ui/Toast.tsx';

interface LockedScreenProps {
  onUnlock: () => void;
  hasPin: boolean;
  correctPin: string | null;
  userEmail?: string;
  userName?: string;
  securityQuestion?: string;
  securityAnswer?: string;
  onResetPin: (newPin: string | null) => void;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

export const LockedScreen: React.FC<LockedScreenProps> = ({
  onUnlock,
  hasPin,
  correctPin,
  userEmail,
  securityQuestion,
  securityAnswer,
  onResetPin,
  onShowToast,
}) => {
  const [pin, setPin] = useState('');
  const [showNumbers, setShowNumbers] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [mode, setMode] = useState<'unlock' | 'security-question' | 'set-new-pin'>('unlock');
  const [answerInput, setAnswerInput] = useState('');
  const [enterCycle, setEnterCycle] = useState(1);
  const [isRevealing, setIsRevealing] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );
  const wasHiddenRef = useRef(
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );

  // Replay the zoom-in entrance smoothly the moment the user switches back to this tab
  useEffect(() => {
    let rafId = 0;

    const triggerReveal = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      setIsRevealing(false);
      rafId = window.requestAnimationFrame(() => {
        setEnterCycle((c) => c + 1);
        setIsRevealing(true);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (rafId) window.cancelAnimationFrame(rafId);
        wasHiddenRef.current = true;
        setIsRevealing(false);
      } else if (document.visibilityState === 'visible') {
        if (wasHiddenRef.current) {
          wasHiddenRef.current = false;
          triggerReveal();
        } else {
          setIsRevealing(true);
        }
      }
    };

    const handleWindowFocus = () => {
      if (wasHiddenRef.current && document.visibilityState === 'visible') {
        wasHiddenRef.current = false;
        triggerReveal();
      }
    };

    if (wasHiddenRef.current && document.visibilityState === 'visible') {
      wasHiddenRef.current = false;
      triggerReveal();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const activeQuestion =
    securityQuestion && securityQuestion.trim().length > 0
      ? securityQuestion
      : 'What is your signed-in account email address?';

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 6) return;
      playRetroClick();
      const nextPin = pin + digit;
      setPin(nextPin);
      setPinError(false);

      if (nextPin.length === 6) {
        if (mode === 'set-new-pin') {
          playRetroUnlockChime();
          onResetPin(nextPin);
          return;
        }

        if (!correctPin || nextPin === correctPin) {
          playRetroUnlockChime();
          onUnlock();
        } else {
          playRetroBeep();
          setPinError(true);
          onShowToast?.('Incorrect PIN code. Try again!', 'error');
          setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 420);
        }
      }
    },
    [pin, mode, correctPin, onUnlock, onResetPin, onShowToast]
  );

  const handleClear = useCallback(() => {
    playRetroClick();
    setPin('');
    setPinError(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (pin.length === 0) return;
    playRetroClick();
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  }, [pin.length]);

  // Allow typing digits and Backspace on physical keyboard
  useEffect(() => {
    if (mode === 'security-question' || (!hasPin && mode !== 'set-new-pin')) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, hasPin, handleDigit, handleDelete, handleClear]);

  const handleVerifySecurityQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = answerInput.trim().toLowerCase();
    const expectedAnswer =
      securityAnswer && securityAnswer.trim().length > 0
        ? securityAnswer.trim().toLowerCase()
        : (userEmail || '').trim().toLowerCase();

    if (!cleanInput) {
      playRetroBeep();
      onShowToast?.('Please enter your answer to continue!', 'error');
      return;
    }

    if (
      expectedAnswer &&
      cleanInput !== expectedAnswer &&
      cleanInput !== (userEmail || '').trim().toLowerCase()
    ) {
      playRetroBeep();
      onShowToast?.('Answer mismatch. Try your account email!', 'error');
      return;
    }

    playRetroClick();
    setPin('');
    setMode('set-new-pin');
  };

  return (
    <div
      data-lock-screen="true"
      data-lock-revealed={isRevealing ? 'true' : 'false'}
      data-lock-cycle={enterCycle}
      className="min-h-[100dvh] bg-[#0a0a0d] text-white select-none relative overflow-hidden font-sans"
    >
      {/* Unified Whole-Component Lock Stage with Zoom-In Entrance */}
      <div
        key={`stage-${enterCycle}`}
        data-lock-stage="true"
        className={`relative w-full min-h-[100dvh] flex flex-col items-center justify-center p-4 ${
          isRevealing ? 'lock-stage-zoom-in' : 'opacity-0 scale-[0.94]'
        }`}
      >
        {/* Subtle Industry-Standard Ambient Glow (Zero Blur Filter Overhead) */}
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(540px circle at 50% 50%, rgba(255, 144, 0, 0.085), transparent 70%)',
          }}
        />

        {/* Refined Industry-Standard Dark Glass Lock Card (Zero Blur Repaint Lag) */}
        <div
          data-lock-card="true"
          className={`w-full rounded-2xl bg-[#121318]/96 border border-white/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col items-center text-center relative z-10 overflow-hidden ${
            !hasPin && mode === 'unlock' ? 'max-w-[360px] px-6 py-8' : 'max-w-[330px] px-5 py-6'
          }`}
        >
          {/* Raw LINKHUB Site Logo */}
          <div className={!hasPin && mode === 'unlock' ? 'mb-6' : 'mb-4'}>
            <LinkHubLogo size="md" />
          </div>

          {/* Mode 1: Security Question Recovery */}
          {mode === 'security-question' ? (
            <div className="w-full flex flex-col items-center">
            <h1 className="font-title font-bold text-base text-white tracking-tight mb-1">
              Security Recovery
            </h1>
            <p className="text-[11px] text-zinc-400 mb-4">
              Answer your security question to reset your PIN
            </p>

            <form
              onSubmit={handleVerifySecurityQuestion}
              className="w-full space-y-3 text-left"
              noValidate
            >
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#ff9000] mb-1 flex items-center gap-1.5">
                  <KeyRound size={11} />
                  <span>Security Question</span>
                </div>
                <p className="text-xs font-medium text-zinc-200">{activeQuestion}</p>
              </div>

              <div>
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="Enter your answer..."
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#ff9000] text-xs text-white placeholder:text-zinc-500 outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] active:scale-[0.99] text-black font-bold text-xs uppercase tracking-wider shadow-[0_8px_20px_rgba(255,144,0,0.25)] transition-all cursor-pointer"
              >
                Verify & Set New PIN
              </button>

              <button
                type="button"
                onClick={() => {
                  playRetroUnlockChime();
                  onResetPin(null);
                }}
                className="w-full h-9 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-zinc-300 text-[11px] font-medium transition-colors cursor-pointer"
              >
                Remove PIN & Unlock Vault
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                playRetroClick();
                setMode('unlock');
              }}
              className="mt-4 text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft size={12} />
              <span>Back to Security PIN</span>
            </button>
          </div>
        ) : hasPin || mode === 'set-new-pin' ? (
          /* Mode 2: Enter Security PIN / Set New PIN */
          <div className="w-full flex flex-col items-center">
            <h1 className="font-title font-bold text-base sm:text-lg text-white tracking-tight mb-1">
              {mode === 'set-new-pin' ? 'Create New Security PIN' : 'Enter Security PIN'}
            </h1>
            <p className="text-[11px] text-zinc-400 mb-4">
              {mode === 'set-new-pin'
                ? 'Choose a new 6-digit PIN to protect your vault'
                : 'Enter 6-digit PIN to access'}
            </p>

            {/* 6 Compact Circular Passcode Dots */}
            <div className="flex items-center justify-center gap-2.5 mb-2.5">
              {Array.from({ length: 6 }).map((_, i) => {
                const isFilled = i < pin.length;
                return (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors duration-150 ${
                      pinError
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

            {/* Centered Forgot PIN? */}
            {mode === 'set-new-pin' ? (
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setPin('');
                  setMode('unlock');
                }}
                className="mt-4 text-[11px] text-zinc-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer mx-auto"
              >
                <ArrowLeft size={12} />
                <span>Cancel</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setPinError(false);
                  setPin('');
                  setMode('security-question');
                }}
                className="mt-4 text-[11px] font-medium text-zinc-300 hover:text-[#ff9000] flex items-center justify-center transition-colors cursor-pointer mx-auto"
              >
                <span>Forgot PIN?</span>
              </button>
            )}
          </div>
        ) : (
          /* Mode 3: Session Locked without a PIN set */
          <div className="w-full flex flex-col items-center">
            {/* Clean Minimalist Person Lock Icon */}
            <div className="my-3 flex items-center justify-center">
              <BsPersonLock
                size={42}
                aria-hidden="true"
                className="text-[#ff9000] drop-shadow-[0_0_18px_rgba(255,144,0,0.35)]"
              />
            </div>

            <h1 className="font-title font-bold text-lg sm:text-xl text-white tracking-tight mt-2 mb-2">
              Vault Session Locked
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-[260px] mb-7">
              Your session was automatically locked when switching tabs.
            </p>

            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={() => {
                  playRetroUnlockChime();
                  onUnlock();
                }}
                className="w-full h-11 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] active:scale-[0.98] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center shadow-[0_10px_24px_rgba(255,144,0,0.28)] transition-all cursor-pointer"
              >
                <span>Unlock Vault</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setPin('');
                  setMode('set-new-pin');
                }}
                className="w-full h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white text-xs font-medium flex items-center justify-center transition-colors cursor-pointer"
              >
                <span>Set 6-Digit Security PIN</span>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
