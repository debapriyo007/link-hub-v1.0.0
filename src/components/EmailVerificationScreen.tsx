import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LinkHubLogo } from './LinkHubLogo.tsx';
import { playRetroBeep, playRetroClick, playRetroUnlockChime } from '../utils/sound.ts';
import type { ToastVariant } from './ui/Toast.tsx';

interface EmailVerificationScreenProps {
  email: string;
  onRefreshVerification: (silent?: boolean) => Promise<boolean>;
  onResendEmail: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  email,
  onRefreshVerification,
  onResendEmail,
  onSignOut,
  onShowToast,
}) => {
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds > 0]);

  const checkVerificationStatus = useCallback(
    async (silent = false) => {
      if (checking) return;
      if (!silent) {
        playRetroClick();
        setStatusMessage('');
      }
      setChecking(true);
      try {
        const verified = await onRefreshVerification(silent);
        if (verified) {
          playRetroUnlockChime();
          return;
        }
        if (!silent) {
          playRetroBeep();
          setStatusMessage('Email not verified yet. Open the inbox link first.');
        }
      } catch {
        if (!silent) {
          playRetroBeep();
          setStatusMessage('Could not check verification status right now.');
        }
      } finally {
        setChecking(false);
      }
    },
    [checking, onRefreshVerification]
  );

  // Quietly re-check when returning from inbox tab
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void onRefreshVerification(true).then((verified) => {
          if (verified) {
            playRetroUnlockChime();
          }
        });
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [onRefreshVerification]);

  const handleResend = async () => {
    if (resending) return;
    if (cooldownSeconds > 0) {
      onShowToast?.(`Please wait ${cooldownSeconds}s before resending.`, 'info');
      return;
    }
    playRetroClick();
    setResending(true);
    setStatusMessage('');
    try {
      await onResendEmail();
      setCooldownSeconds(45);
      onShowToast?.('Verification link sent! Check your inbox or spam folder.', 'success');
    } catch (err: unknown) {
      playRetroBeep();
      const raw = err instanceof Error ? err.message : '';
      const friendly = raw.includes('too-many-requests')
        ? 'Too many requests. Please wait a minute and try again.'
        : 'Could not resend verification link right now.';
      setStatusMessage(friendly);
      onShowToast?.(friendly, 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#09090b] text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans selection:bg-[#ff9000] selection:text-black">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 36%, rgba(255, 144, 0, 0.11), transparent 72%)',
        }}
      />

      <section
        aria-label="Email link verification"
        className="w-full max-w-[420px] rounded-[28px] bg-[#121318]/92 border border-white/[0.08] shadow-[0_32px_90px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] px-7 sm:px-9 py-9 relative z-10"
      >
        <div className="flex justify-center mb-7">
          <LinkHubLogo size="md" />
        </div>

        <h1 className="font-title font-bold text-2xl sm:text-[26px] text-white tracking-tight text-center">
          Verify your email
        </h1>
        <p className="mt-2.5 text-[13.5px] text-zinc-400 text-center leading-relaxed">
          We sent a verification link to{' '}
          <span className="block mt-1 text-zinc-100 font-medium break-all">{email}</span>
        </p>

        {statusMessage && (
          <p role="alert" className="mt-4 text-xs text-amber-400 text-center leading-relaxed">
            {statusMessage}
          </p>
        )}

        <button
          type="button"
          onClick={() => checkVerificationStatus(false)}
          disabled={checking}
          className="mt-7 w-full h-12 rounded-2xl bg-[#ff9000] hover:bg-[#ffa31a] active:scale-[0.99] disabled:opacity-55 text-black font-bold text-sm tracking-wide shadow-[0_12px_30px_rgba(255,144,0,0.28)] inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          {checking ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Checking</span>
            </>
          ) : (
            <span>Continue</span>
          )}
        </button>

        <div className="mt-6 pt-5 border-t border-white/[0.07] flex items-center justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldownSeconds > 0}
            className="font-medium text-zinc-300 hover:text-[#ff9000] disabled:text-zinc-500 disabled:cursor-default tabular-nums transition-colors cursor-pointer"
          >
            {resending
              ? 'Sending link...'
              : cooldownSeconds > 0
                ? `Resend in ${cooldownSeconds}s`
                : 'Resend link'}
          </button>

          <span className="h-3 w-px bg-white/[0.14]" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              playRetroClick();
              onSignOut();
            }}
            className="font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Use another account
          </button>
        </div>
      </section>
    </div>
  );
};
