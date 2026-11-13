import React, { useState, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2, QrCode } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, googleProvider, signInWithPopup } from '../firebase.ts';
import { playRetroUnlockChime, playRetroBeep } from '../utils/sound.ts';
import { LinkHubLogo } from './LinkHubLogo.tsx';

interface LoginPageProps {
  onOpenScanQr?: () => void;
  pendingSharedSummary?: {
    categoryName: string;
    linkCount: number;
  } | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onOpenScanQr,
  pendingSharedSummary,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [isCreateAccount, setIsCreateAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  const GoogleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
      />
    </svg>
  );

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    setResetSuccess(null);
    try {
      await signInWithPopup(auth, googleProvider);
      playRetroUnlockChime();
    } catch (err: unknown) {
      playRetroBeep();
      const message = err instanceof Error ? err.message : 'Authentication could not be completed.';
      if (message.includes('auth/popup-closed-by-user')) {
        setAuthError('Sign-in popup was closed before finishing. Please try again.');
      } else if (message.includes('auth/popup-blocked')) {
        setAuthError('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setAuthError(message);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError(null);
    setResetSuccess(null);
    if (!email.trim()) {
      setAuthError('Please enter your email address first to reset your password.');
      emailInputRef.current?.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSuccess('Password reset link sent to your email address.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not send reset email.';
      setAuthError(message);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSuccess(null);
    if (!email.trim()) {
      setAuthError('Please enter your email address.');
      emailInputRef.current?.focus();
      return;
    }
    if (!password.trim()) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);
    try {
      if (isCreateAccount) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      playRetroUnlockChime();
    } catch (err: unknown) {
      playRetroBeep();
      const message = err instanceof Error ? err.message : 'Unable to sign in with email.';
      if (message.includes('auth/operation-not-allowed')) {
        setAuthError('Email/Password sign-in is not enabled yet. Please use Google login below.');
      } else if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
        setAuthError('Invalid email or password. Please check your credentials.');
      } else {
        setAuthError(message);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0e] text-white flex flex-col justify-center font-sans selection:bg-[#ff9000] selection:text-black relative overflow-x-hidden">
      {/* Lightweight GPU-Composited Ambient Glow (Zero Blur Filter Lag) */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(620px circle at 25% 12%, rgba(255, 144, 0, 0.14), transparent 70%), radial-gradient(680px circle at 78% 88%, rgba(255, 144, 0, 0.1), transparent 70%)',
        }}
      />

      {/* Main Centered Split Layout — No Outer Box or Border Around It */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-8 lg:px-12 py-6 sm:py-10 relative z-10">
        <div className="w-full max-w-[1060px] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative">
          {/* Left Panel: Hidden on Phone/Mobile Screens, Visible on Desktop (lg+) */}
          <div className="hidden lg:flex lg:col-span-6 rounded-[32px] bg-gradient-to-b from-[#ff8800] via-[#ff9000] to-[#f59e0b] relative overflow-hidden flex-col justify-between pt-11 px-10 pb-0 min-h-[600px]">
            {/* Subtle Speckled Texture Overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 10px 10px',
              }}
            />
            {/* Soft Bottom Warm Highlight */}
            <div
              className="pointer-events-none absolute bottom-0 inset-x-0 h-56 opacity-50"
              style={{
                background: 'linear-gradient(to top, rgba(255,235,205,0.45), transparent)',
              }}
            />

            {/* Top Headline & Subtitle */}
            <div className="relative z-10 max-w-[390px]">
              <h1 className="font-title font-extrabold text-[40px] text-white leading-[1.15] tracking-tight">
                Organize{' '}
                <br />
                every link in{' '}
                <br />
                your{' '}
                <span className="relative inline-block">
                  smart vault.
                  {/* Signature Curved White Underline */}
                  <svg
                    className="w-full h-3.5 mt-1 text-white"
                    viewBox="0 0 220 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 12.5C58 3.5 156 3.5 217 12.5"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>

              <p className="mt-5 text-white/95 text-[13.5px] font-medium leading-relaxed max-w-[340px]">
                Save, categorize, and PIN-lock your favorite bookmarks in one fast, distraction-free personal link hub.
              </p>
            </div>

            {/* Bottom 3D-Styled Man & Woman Illustration Flush with Bottom */}
            <div className="relative z-10 mt-6 flex items-end justify-center select-none pointer-events-none">
              <svg
                className="w-full max-w-[400px] h-[290px] overflow-visible"
                viewBox="0 0 420 300"
                fill="none"
                role="img"
                aria-label="LINKHUB Dashboard Creators"
              >
                <defs>
                  {/* Soft 3D Skin & Fabric Gradients */}
                  <linearGradient id="skinWarm1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#F7C5A8" />
                    <stop offset="60%" stopColor="#E5A685" />
                    <stop offset="100%" stopColor="#C98564" />
                  </linearGradient>
                  <linearGradient id="skinWarm2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FAD6BF" />
                    <stop offset="65%" stopColor="#E9B596" />
                    <stop offset="100%" stopColor="#CE9474" />
                  </linearGradient>
                  <linearGradient id="vestBeige" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D7CBC0" />
                    <stop offset="100%" stopColor="#ADA094" />
                  </linearGradient>
                  <linearGradient id="shirtBlueGrey" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#E6ECF2" />
                    <stop offset="100%" stopColor="#B8C4D0" />
                  </linearGradient>
                  <linearGradient id="pantsKhaki" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#947B57" />
                    <stop offset="100%" stopColor="#6D5739" />
                  </linearGradient>
                  <linearGradient id="yellowTop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FCE068" />
                    <stop offset="65%" stopColor="#E6C340" />
                    <stop offset="100%" stopColor="#C7A125" />
                  </linearGradient>
                  <linearGradient id="whitePants" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5F5F7" />
                    <stop offset="100%" stopColor="#D4D5DA" />
                  </linearGradient>
                  <linearGradient id="hairBrown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6E4730" />
                    <stop offset="100%" stopColor="#3D2415" />
                  </linearGradient>
                  <linearGradient id="hairBlack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2D2F36" />
                    <stop offset="100%" stopColor="#121317" />
                  </linearGradient>
                  <filter id="softShadow" x="-15%" y="-10%" width="130%" height="130%">
                    <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#7c2d12" floodOpacity="0.28" />
                  </filter>
                </defs>

                {/* ==================== LEFT CHARACTER (Male with glasses, vest & coffee) ==================== */}
                <g filter="url(#softShadow)">
                  {/* Khaki Trousers */}
                  <path
                    d="M95 212 H175 L182 300 H141 L135 246 L129 300 H88 L95 212 Z"
                    fill="url(#pantsKhaki)"
                  />
                  {/* Trouser Pleat Details */}
                  <path d="M112 222 V296" stroke="#59452B" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
                  <path d="M158 222 V296" stroke="#59452B" strokeWidth="2" strokeLinecap="round" opacity="0.45" />

                  {/* Leather Belt */}
                  <rect x="94" y="206" width="82" height="10" rx="3" fill="#4A3223" />
                  <rect x="128" y="205" width="14" height="12" rx="2.5" stroke="#D4AF37" strokeWidth="2.5" fill="none" />

                  {/* Left & Right Shirt Sleeves */}
                  <path
                    d="M90 120 C72 128 60 154 58 178 C57 188 66 194 78 190 L98 182 L96 126 Z"
                    fill="url(#shirtBlueGrey)"
                  />
                  <path
                    d="M178 120 C194 128 202 158 208 182 C210 190 202 198 192 194 L172 178 L174 126 Z"
                    fill="url(#shirtBlueGrey)"
                  />

                  {/* Knitted Sweater Vest */}
                  <path
                    d="M92 116 C92 112 104 108 135 108 C166 108 178 112 178 116 L176 208 H94 L92 116 Z"
                    fill="url(#vestBeige)"
                  />
                  {/* Vest V-Neck & Collar */}
                  <path d="M116 108 L135 142 L154 108 Z" fill="url(#shirtBlueGrey)" />
                  <path d="M114 108 L135 144 L156 108" stroke="#9B8E82" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Shirt Collar Flaps */}
                  <path d="M118 104 L135 122 L124 128 L112 110 Z" fill="#F8FAFC" />
                  <path d="M152 104 L135 122 L146 128 L158 110 Z" fill="#E2E8F0" />
                  {/* Subtle Ribbing at Bottom of Vest */}
                  <line x1="102" y1="196" x2="102" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="112" y1="196" x2="112" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="122" y1="196" x2="122" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="132" y1="196" x2="132" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="142" y1="196" x2="142" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="152" y1="196" x2="152" y2="208" stroke="#9B8E82" strokeWidth="2" />
                  <line x1="162" y1="196" x2="162" y2="208" stroke="#9B8E82" strokeWidth="2" />

                  {/* Neck */}
                  <rect x="124" y="88" width="22" height="24" rx="10" fill="url(#skinWarm1)" />

                  {/* Ears */}
                  <circle cx="103" cy="64" r="7" fill="url(#skinWarm1)" />
                  <circle cx="167" cy="64" r="7" fill="url(#skinWarm1)" />

                  {/* Head */}
                  <rect x="105" y="32" width="60" height="64" rx="28" fill="url(#skinWarm1)" />

                  {/* Stylized 3D Sculpted Brown Hair */}
                  <path
                    d="M103 54 C101 34 114 20 136 20 C158 20 169 32 167 54 C164 42 154 36 135 36 C116 36 106 42 103 54 Z"
                    fill="url(#hairBrown)"
                  />
                  <path
                    d="M112 25 C124 16 150 18 160 28 C148 26 125 26 112 25 Z"
                    fill="#85583E"
                  />

                  {/* Eyebrows */}
                  <path d="M116 50 Q123 47 129 50" stroke="#4A2C18" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M141 50 Q147 47 154 50" stroke="#4A2C18" strokeWidth="2.8" strokeLinecap="round" />

                  {/* Eyes */}
                  <circle cx="123" cy="59" r="3.2" fill="#1F1610" />
                  <circle cx="147" cy="59" r="3.2" fill="#1F1610" />
                  <circle cx="124" cy="58" r="1" fill="#FFFFFF" />
                  <circle cx="148" cy="58" r="1" fill="#FFFFFF" />

                  {/* Glasses Frame */}
                  <rect x="112" y="51" width="21" height="16" rx="5" stroke="#27272A" strokeWidth="2.8" fill="rgba(255,255,255,0.12)" />
                  <rect x="137" y="51" width="21" height="16" rx="5" stroke="#27272A" strokeWidth="2.8" fill="rgba(255,255,255,0.12)" />
                  <line x1="133" y1="58" x2="137" y2="58" stroke="#27272A" strokeWidth="2.8" />

                  {/* 3D Nose */}
                  <path d="M135 58 L133 69 C133 71 137 71 137 69 Z" fill="#D48D6B" />

                  {/* Friendly Open Smile */}
                  <path d="M126 77 Q135 84 144 77 Z" fill="#7F1D1D" />
                  <path d="M128 77.5 H142" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />

                  {/* Coffee Cup Held in Right Hand */}
                  <g transform="translate(88, 166)">
                    {/* Cup Body */}
                    <path d="M4 6 H28 L25 38 H7 L4 6 Z" fill="#F5F5F4" />
                    {/* Cardboard Sleeve */}
                    <path d="M5 14 H27 L25.8 28 H6.2 L5 14 Z" fill="#A16207" />
                    {/* Black Coffee Lid */}
                    <rect x="2" y="2" width="28" height="5" rx="2" fill="#27272A" />
                    {/* Hand Holding Cup */}
                    <circle cx="6" cy="22" r="7.5" fill="url(#skinWarm1)" />
                  </g>

                  {/* Outstretched Left Hand Gesture */}
                  <g transform="translate(196, 184)">
                    <ellipse cx="12" cy="10" rx="10" ry="7" transform="rotate(18 12 10)" fill="url(#skinWarm1)" />
                    <circle cx="20" cy="6" r="3.5" fill="url(#skinWarm1)" />
                  </g>
                </g>

                {/* ==================== RIGHT CHARACTER (Female with dark bob, glasses & yellow top) ==================== */}
                <g filter="url(#softShadow)">
                  {/* Back Hair Layer (Dark Bob) */}
                  <path
                    d="M266 42 C256 58 256 88 262 102 H334 C340 88 340 58 330 42 Z"
                    fill="url(#hairBlack)"
                  />

                  {/* White Wide-Leg Pants */}
                  <path
                    d="M254 214 H342 L350 300 H302 L298 248 L294 300 H246 L254 214 Z"
                    fill="url(#whitePants)"
                  />
                  {/* Pant Fold Lines */}
                  <path d="M274 224 L270 296" stroke="#B8BAC2" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                  <path d="M322 224 L326 296" stroke="#B8BAC2" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

                  {/* Arms Behind Back */}
                  <path
                    d="M250 156 C246 176 252 198 260 210 L270 204 L264 156 Z"
                    fill="url(#skinWarm2)"
                  />
                  <path
                    d="M346 156 C350 176 344 198 336 210 L326 204 L332 156 Z"
                    fill="url(#skinWarm2)"
                  />

                  {/* Relaxed Yellow Tee */}
                  <path
                    d="M256 118 C266 110 330 110 340 118 L358 162 L336 170 L330 148 L338 218 H258 L266 148 L260 170 L238 162 L256 118 Z"
                    fill="url(#yellowTop)"
                  />
                  {/* Subtle Drape Folds on Yellow Top */}
                  <path d="M278 146 Q284 182 274 214" stroke="#C7A125" strokeWidth="2" fill="none" opacity="0.5" />
                  <path d="M316 146 Q310 182 320 214" stroke="#C7A125" strokeWidth="2" fill="none" opacity="0.5" />

                  {/* Neck */}
                  <rect x="288" y="92" width="20" height="24" rx="9" fill="url(#skinWarm2)" />
                  {/* Crew Neckline Collar */}
                  <path d="M278 114 Q298 126 318 114" stroke="#E0B830" strokeWidth="5" strokeLinecap="round" fill="none" />

                  {/* Head */}
                  <rect x="270" y="38" width="56" height="60" rx="27" fill="url(#skinWarm2)" />

                  {/* Front Bob Hair Bangs & Side Sweep */}
                  <path
                    d="M266 56 C266 34 280 24 298 24 C318 24 332 36 332 62 C332 76 329 92 324 98 C324 80 322 58 312 48 C298 54 278 54 266 56 Z"
                    fill="url(#hairBlack)"
                  />

                  {/* Eyebrows */}
                  <path d="M279 56 Q285 53 291 56" stroke="#18181B" strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M305 56 Q311 53 317 56" stroke="#18181B" strokeWidth="2.4" strokeLinecap="round" />

                  {/* Eyes */}
                  <circle cx="285" cy="64" r="3" fill="#18181B" />
                  <circle cx="311" cy="64" r="3" fill="#18181B" />
                  <circle cx="286" cy="63" r="0.9" fill="#FFFFFF" />
                  <circle cx="312" cy="63" r="0.9" fill="#FFFFFF" />

                  {/* Glasses Frame */}
                  <rect x="275" y="57" width="20" height="14" rx="4.5" stroke="#27272A" strokeWidth="2.4" fill="rgba(255,255,255,0.12)" />
                  <rect x="301" y="57" width="20" height="14" rx="4.5" stroke="#27272A" strokeWidth="2.4" fill="rgba(255,255,255,0.12)" />
                  <line x1="295" y1="63" x2="301" y2="63" stroke="#27272A" strokeWidth="2.4" />

                  {/* Nose */}
                  <path d="M298 63 L296 72 C296 73.5 300 73.5 300 72 Z" fill="#D59B7D" />

                  {/* Warm Subtle Smile */}
                  <path d="M290 80 Q298 85 305 80" stroke="#9A3412" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                </g>
              </svg>
            </div>
          </div>

          {/* Right Panel: Frosted Glass Login Form in LINKHUB Dark Theme */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center px-2 sm:px-8 lg:px-12 py-4 sm:py-6">
            <div className="w-full max-w-[400px] flex flex-col items-center">
              {/* Top Brand Logo */}
              <div className="mb-5 sm:mb-6">
                <LinkHubLogo size="lg" />
              </div>

              {/* Welcome Heading & Subtitle */}
              <h2 className="font-title font-extrabold text-2xl sm:text-[34px] text-white tracking-tight text-center mb-1.5">
                {isCreateAccount ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 text-center mb-6 sm:mb-8">
                {isCreateAccount
                  ? 'Sign up to start your private bookmark vault'
                  : 'Please login to your account'}
              </p>

              {/* Pending Shared Category Links Ready to Save Banner */}
              {pendingSharedSummary && (
                <div className="w-full mb-5 p-3.5 rounded-2xl bg-[#ff9000]/12 border border-[#ff9000]/40 text-zinc-100 text-xs flex items-center justify-between gap-3 text-left">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <QrCode size={16} className="text-[#ff9000] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-[#ff9000]">
                        {pendingSharedSummary.linkCount} shared link
                        {pendingSharedSummary.linkCount === 1 ? '' : 's'} queued
                      </div>
                      <div className="text-[11px] text-zinc-300 truncate">
                        Sign in to save &ldquo;{pendingSharedSummary.categoryName}&rdquo; to your vault.
                      </div>
                    </div>
                  </div>
                  {onOpenScanQr && (
                    <button
                      type="button"
                      onClick={onOpenScanQr}
                      className="px-2.5 py-1 rounded-lg bg-[#ff9000]/20 hover:bg-[#ff9000]/30 text-[#ff9000] font-semibold text-[11px] shrink-0 cursor-pointer transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}

              {/* Error or Reset Status Alert */}
              {authError && (
                <div className="w-full mb-5 p-3.5 rounded-2xl bg-red-950/50 backdrop-blur-md border border-red-500/40 text-red-300 text-xs flex items-start gap-2.5 text-left">
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="w-full mb-5 p-3.5 rounded-2xl bg-emerald-950/50 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5 text-left">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              {/* Email & Password Form */}
              <form onSubmit={handleEmailSubmit} className="w-full space-y-3.5 sm:space-y-4" noValidate>
                <div>
                  <input
                    ref={emailInputRef}
                    type="email"
                    aria-label="Email address"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Email address"
                    className="w-full h-12 sm:h-14 px-4 sm:px-5 rounded-2xl glass-input focus:border-[#ff9000] focus:bg-white/[0.07] text-sm text-white placeholder:text-zinc-400 outline-none transition-all"
                  />
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    aria-label="Password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Password"
                    className="w-full h-12 sm:h-14 pl-4 sm:pl-5 pr-12 rounded-2xl glass-input focus:border-[#ff9000] focus:bg-white/[0.07] text-sm text-white placeholder:text-zinc-400 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors cursor-pointer p-1"
                  >
                    {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                </div>

                {/* Forgot Password Link */}
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-zinc-400 hover:text-[#ff9000] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Primary Signature #ff9000 Orange Login Button */}
                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full h-12 sm:h-14 mt-1.5 rounded-2xl bg-[#ff9000] hover:bg-[#ffa31a] active:scale-[0.99] disabled:opacity-60 text-black font-bold text-sm tracking-wide shadow-[0_12px_30px_rgba(255,144,0,0.3)] transition-all cursor-pointer"
                >
                  {isSigningIn
                    ? 'Please wait...'
                    : isCreateAccount
                      ? 'Signup'
                      : 'Login'}
                </button>
              </form>

              {/* Divider: Or Login with */}
              <div className="w-full flex items-center gap-4 my-5 sm:my-6">
                <div className="h-px bg-white/[0.09] flex-1" />
                <span className="text-xs font-medium text-zinc-400 whitespace-nowrap">
                  Or Login with
                </span>
                <div className="h-px bg-white/[0.09] flex-1" />
              </div>

              {/* Single Prominent Frosted Glass Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSigningIn}
                className="w-full h-12 sm:h-13 px-5 rounded-2xl glass-input hover:bg-white/[0.08] hover:border-[#ff9000]/50 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer whitespace-nowrap"
              >
                <GoogleIcon className="w-4 h-4" />
                <span>Continue with Google</span>
              </button>

              {/* Bottom Signup / Login Switch */}
              <p className="mt-5 sm:mt-6 text-xs text-zinc-400 text-center">
                {isCreateAccount ? 'Already have an account? ' : "Don't have an account? "}
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateAccount(!isCreateAccount);
                    setAuthError(null);
                    setResetSuccess(null);
                  }}
                  className="text-[#ff9000] font-semibold underline underline-offset-4 hover:text-[#ffa31a] transition-colors cursor-pointer"
                >
                  {isCreateAccount ? 'Login' : 'Signup'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
