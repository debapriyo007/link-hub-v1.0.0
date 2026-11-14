import React, { useState, useRef, useEffect } from 'react';
import {
  BellRing,
  ShieldCheck,
  CircleUserRound,
  SlidersHorizontal,
  X,
  Check,
  FileUp,
  HardDriveDownload,
  LogOut,
  ImagePlus,
  ShieldAlert,
  QrCode,
  LockKeyhole,
  Volume2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  SquarePen,
} from 'lucide-react';
import { UserProfile } from '../types.ts';
import { playRetroClick, playRetroBeep } from '../utils/sound.ts';
import { compressAvatarFile } from '../utils/avatarUtils.ts';
import { GlassSelect } from './ui/GlassSelect.tsx';

interface ProfileSettingsPageProps {
  user: UserProfile;
  linksCount: number;
  favoritesCount: number;
  categoriesCount: number;
  onSaveProfile: (updated: Partial<UserProfile>) => Promise<void>;
  onSavePin: (newPin: string | null) => Promise<void>;
  onLockVault: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onScanQrClick?: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

type SettingsSection = 'account' | 'security' | 'tools' | 'notifications';
type MobileSubView = null | 'account' | 'security';

const TIMEZONES = [
  { value: 'IST (GMT+05:30)', label: 'India Standard Time — Kolkata (GMT+05:30)' },
  { value: 'UTC (GMT+00:00)', label: 'Coordinated Universal Time — London (GMT+00:00)' },
  { value: 'EST (GMT-05:00)', label: 'Eastern Time — New York (GMT-05:00)' },
  { value: 'PST (GMT-08:00)', label: 'Pacific Time — San Francisco (GMT-08:00)' },
  { value: 'CET (GMT+01:00)', label: 'Central European Time — Berlin (GMT+01:00)' },
  { value: 'JST (GMT+09:00)', label: 'Japan Standard Time — Tokyo (GMT+09:00)' },
  { value: 'AEST (GMT+10:00)', label: 'Australian Eastern Time — Melbourne (GMT+10:00)' },
];

const SECURITY_QUESTIONS = [
  'What is your signed-in account email address?',
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the name of your first school?',
  'What is your favorite childhood book or movie?',
  "What is your mother's maiden name?",
  'What was the make of your first car?',
];

export const ProfileSettingsPage: React.FC<ProfileSettingsPageProps> = React.memo(
  ({
    user,
    linksCount,
    categoriesCount,
    onSaveProfile,
    onSavePin,
    onLockVault,
    onImportClick,
    onExportClick,
    onScanQrClick,
    onSignOut,
    onClose,
  }) => {
    const [activeSection, setActiveSection] = useState<SettingsSection>('account');
    const [mobileSubView, setMobileSubView] = useState<MobileSubView>(null);

    // Parse default first & last name from displayName
    const nameParts = (user.displayName || 'LINKHUB User').trim().split(/\s+/);
    const defaultFirst = user.firstName ?? (nameParts[0] || '');
    const defaultLast = user.lastName ?? (nameParts.slice(1).join(' ') || '');

    const [firstName, setFirstName] = useState(defaultFirst);
    const [lastName, setLastName] = useState(defaultLast);
    const [email, setEmail] = useState(user.email || '');
    const [timezone, setTimezone] = useState(user.countryCode || 'IST (GMT+05:30)');
    const [photoURL, setPhotoURL] = useState(user.photoURL || '');

    // Security & PIN state (never pre-fill or echo plaintext secrets)
    const hasConfiguredPin = Boolean(user.pinVerifier || user.pin);
    const hasConfiguredRecoveryAnswer = Boolean(user.securityAnswerHash);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState('');
    const initialQuestion =
      user.securityQuestion && SECURITY_QUESTIONS.includes(user.securityQuestion)
        ? user.securityQuestion
        : SECURITY_QUESTIONS[0];
    const [securityQuestion, setSecurityQuestion] = useState(initialQuestion);
    const [securityAnswer, setSecurityAnswer] = useState('');

    // Notification / Preference toggles
    const [soundEffects, setSoundEffects] = useState(user.soundEnabled !== false);
    const [autoLockOnTabSwitch, setAutoLockOnTabSwitch] = useState(
      (user.autoLockMinutes ?? 1) > 0
    );
    const [confettiOnSave, setConfettiOnSave] = useState(user.confettiEnabled !== false);

    const [saving, setSaving] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync local controls whenever real-time Firestore updates arrive from another device
    useEffect(() => {
      const parts = (user.displayName || 'LINKHUB User').trim().split(/\s+/);
      setFirstName(user.firstName ?? (parts[0] || ''));
      setLastName(user.lastName ?? (parts.slice(1).join(' ') || ''));
    }, [user.displayName, user.firstName, user.lastName]);

    useEffect(() => {
      setEmail(user.email || '');
    }, [user.email]);

    useEffect(() => {
      setTimezone(user.countryCode || 'IST (GMT+05:30)');
    }, [user.countryCode]);

    useEffect(() => {
      setPhotoURL(user.photoURL || '');
    }, [user.photoURL]);

    useEffect(() => {
      setSoundEffects(user.soundEnabled !== false);
    }, [user.soundEnabled]);

    useEffect(() => {
      setAutoLockOnTabSwitch((user.autoLockMinutes ?? 1) > 0);
    }, [user.autoLockMinutes]);

    useEffect(() => {
      setConfettiOnSave(user.confettiEnabled !== false);
    }, [user.confettiEnabled]);

    useEffect(() => {
      if (user.securityQuestion && SECURITY_QUESTIONS.includes(user.securityQuestion)) {
        setSecurityQuestion(user.securityQuestion);
      }
    }, [user.securityQuestion]);

    const triggerSavedMessage = (msg: string) => {
      setSavedMessage(msg);
      setTimeout(() => setSavedMessage(null), 2600);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const compressed = await compressAvatarFile(file, 128);
        setPhotoURL(compressed);
        await onSaveProfile({ photoURL: compressed });
        triggerSavedMessage('Profile photo synced across devices');
      } catch (err) {
        triggerSavedMessage(
          err instanceof Error ? err.message : 'Could not process image file'
        );
      }
    };

    const handleRemovePhoto = async () => {
      playRetroClick();
      setPhotoURL('');
      await onSaveProfile({ photoURL: '' });
      triggerSavedMessage('Profile photo removed');
    };

    const handleSaveAccount = async (e?: React.FormEvent | React.MouseEvent) => {
      if (e) e.preventDefault();
      playRetroClick();
      setSaving(true);
      const combinedName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'LINKHUB User';
      try {
        await onSaveProfile({
          displayName: combinedName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          countryCode: timezone,
          photoURL,
        });
        triggerSavedMessage('Account settings saved');
      } finally {
        setSaving(false);
      }
    };

    const handleSaveSecurity = async (e?: React.FormEvent | React.MouseEvent) => {
      if (e) e.preventDefault();
      const cleaned = pinInput.replace(/\D/g, '');
      if (cleaned.length > 0 && cleaned.length !== 6) {
        setPinError('Security PIN must be exactly 6 digits.');
        playRetroBeep();
        return;
      }
      playRetroClick();
      setSaving(true);
      setPinError('');
      try {
        if (cleaned.length === 6) {
          await onSavePin(cleaned);
          setPinInput('');
        }
        await onSaveProfile({
          securityQuestion: securityQuestion.trim(),
          ...(securityAnswer.trim() ? { securityAnswerPlain: securityAnswer.trim() } : {}),
        } as Partial<UserProfile> & { securityAnswerPlain?: string });
        if (securityAnswer.trim()) {
          setSecurityAnswer('');
        }
        triggerSavedMessage('Security & PIN recovery settings updated');
      } finally {
        setSaving(false);
      }
    };

    const fullName = `${firstName} ${lastName}`.trim() || user.displayName || 'LINKHUB User';

    const navItems: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
      { id: 'account', label: 'Account', icon: CircleUserRound },
      { id: 'security', label: 'Security & PIN', icon: ShieldCheck },
      { id: 'tools', label: 'Vault Tools', icon: SlidersHorizontal },
      { id: 'notifications', label: 'Notifications', icon: BellRing },
    ];

    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-8 font-sans w-full">
        {/* Hidden shared file input for profile photo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />

        {/* =====================================================================
            MOBILE VIEW ONLY (< md): ANDROID-STYLE NATIVE SETTINGS UI
           ===================================================================== */}
        <div className="md:hidden w-full max-w-md mx-auto rounded-3xl bg-[#0b0b0e] border border-white/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.9)] px-5 py-5 text-white">
          {/* Top Bar: Back Chevron + Centered Title */}
          <div className="relative flex items-center justify-center h-10 mb-4">
            <button
              type="button"
              onClick={() => {
                playRetroClick();
                if (mobileSubView !== null) {
                  setMobileSubView(null);
                } else {
                  onClose();
                }
              }}
              aria-label={mobileSubView ? 'Back to settings' : 'Close settings'}
              className="absolute left-0 w-9 h-9 rounded-full flex items-center justify-center text-zinc-200 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft size={22} strokeWidth={2} />
            </button>
            <h1 className="font-title text-lg font-bold tracking-tight text-white">
              {mobileSubView === 'account'
                ? 'Edit Profile'
                : mobileSubView === 'security'
                  ? 'Security & PIN'
                  : 'Settings'}
            </h1>
          </div>

          {/* MAIN ANDROID SETTINGS MENU */}
          {mobileSubView === null && (
            <div className="flex flex-col">
              {/* Centered Profile Avatar + Name + Edit Icon + Email */}
              <div className="flex flex-col items-center text-center pt-1 pb-5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Tap to change profile photo"
                  className="relative group rounded-full p-0.5 border border-white/15 hover:border-[#ff9000] transition-colors cursor-pointer"
                >
                  {photoURL ? (
                    <img
                      src={photoURL}
                      alt={fullName}
                      className="w-20 h-20 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-[#ff9000]/15 text-[#ff9000] flex items-center justify-center font-bold text-2xl">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>

                <div className="mt-3.5 flex items-center justify-center gap-2">
                  <span className="font-title text-lg font-bold text-white tracking-tight">
                    {fullName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playRetroClick();
                      setMobileSubView('account');
                    }}
                    aria-label="Edit profile"
                    className="p-1 rounded-md text-zinc-400 hover:text-[#ff9000] transition-colors cursor-pointer"
                  >
                    <SquarePen size={14} strokeWidth={2.2} />
                  </button>
                </div>

                <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[240px]">
                  {email || 'No email set'}
                </p>
              </div>

              {/* Section 1: General (Account & Security) */}
              <div className="flex items-center gap-3 mt-2 mb-1.5">
                <span className="text-xs font-medium text-zinc-400 shrink-0">General</span>
                <div className="h-[1px] flex-1 bg-white/[0.12]" />
              </div>

              <div className="flex flex-col">
                {/* Account Details Row */}
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setMobileSubView('account');
                  }}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <CircleUserRound size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">Account</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400 truncate max-w-[110px]">
                      {timezone.split(' ')[0]}
                    </span>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </div>
                </button>

                {/* Security & PIN Row */}
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setMobileSubView('security');
                  }}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ShieldCheck size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">Security & PIN</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400">
                      {hasConfiguredPin ? 'PIN Active' : 'Not Set'}
                    </span>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </div>
                </button>

                {/* Lock Vault Session Row */}
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    onLockVault();
                  }}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <LockKeyhole size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">
                      Lock Vault Session
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-zinc-400 shrink-0" />
                </button>

                {/* Auto-Lock Toggle Row */}
                <div className="w-full py-3.5 flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <BellRing size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">
                      Auto-Lock on Tab Switch
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoLockOnTabSwitch}
                    onClick={() => {
                      playRetroClick();
                      const next = !autoLockOnTabSwitch;
                      setAutoLockOnTabSwitch(next);
                      void onSaveProfile({ autoLockMinutes: next ? 1 : 0 });
                    }}
                    aria-label="Auto-Lock on Tab Switch"
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                      autoLockOnTabSwitch
                        ? 'bg-[#ff9000] shadow-[0_0_12px_rgba(255,144,0,0.35)]'
                        : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full transition-transform ${
                        autoLockOnTabSwitch
                          ? 'translate-x-5 bg-black'
                          : 'translate-x-0 bg-zinc-300'
                      }`}
                    />
                  </button>
                </div>

                {/* Sound Effects Toggle Row */}
                <div className="w-full py-3.5 flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Volume2 size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">
                      Sound Effects
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEffects}
                    onClick={() => {
                      playRetroClick();
                      const next = !soundEffects;
                      setSoundEffects(next);
                      void onSaveProfile({ soundEnabled: next });
                    }}
                    aria-label="Sound Effects"
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                      soundEffects
                        ? 'bg-[#ff9000] shadow-[0_0_12px_rgba(255,144,0,0.35)]'
                        : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full transition-transform ${
                        soundEffects
                          ? 'translate-x-5 bg-black'
                          : 'translate-x-0 bg-zinc-300'
                      }`}
                    />
                  </button>
                </div>

                {/* Confetti Toggle Row */}
                <div className="w-full py-3.5 flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Sparkles size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">
                      Celebration Confetti
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={confettiOnSave}
                    onClick={() => {
                      playRetroClick();
                      const next = !confettiOnSave;
                      setConfettiOnSave(next);
                      void onSaveProfile({ confettiEnabled: next });
                    }}
                    aria-label="Celebration Confetti"
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                      confettiOnSave
                        ? 'bg-[#ff9000] shadow-[0_0_12px_rgba(255,144,0,0.35)]'
                        : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full transition-transform ${
                        confettiOnSave
                          ? 'translate-x-5 bg-black'
                          : 'translate-x-0 bg-zinc-300'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Section 2: Vault Tools */}
              <div className="flex items-center gap-3 mt-4 mb-1.5">
                <span className="text-xs font-medium text-zinc-400 shrink-0">Vault Tools</span>
                <div className="h-[1px] flex-1 bg-white/[0.12]" />
              </div>

              <div className="flex flex-col">
                {onScanQrClick && (
                  <button
                    type="button"
                    onClick={() => {
                      playRetroClick();
                      onScanQrClick();
                    }}
                    className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <QrCode size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                      <span className="text-sm font-semibold text-white truncate">
                        Scan / Enter Share Code
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-zinc-400 shrink-0" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    onImportClick();
                  }}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <FileUp size={19} strokeWidth={2} className="text-zinc-200 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">
                      Import Bookmarks
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-zinc-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    onExportClick();
                  }}
                  className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-xl px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <HardDriveDownload
                      size={19}
                      strokeWidth={2}
                      className="text-zinc-200 shrink-0"
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      Export Backup
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400">{linksCount} links</span>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </div>
                </button>

                {/* Clean Industry-Standard Sign Out Row */}
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    onSignOut();
                  }}
                  className="group w-full mt-1.5 pt-3.5 pb-2 border-t border-white/[0.08] flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] rounded-lg px-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <LogOut
                      size={19}
                      strokeWidth={2}
                      className="text-zinc-400 group-hover:text-white transition-colors shrink-0"
                    />
                    <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      Sign out
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* MOBILE SUB-VIEW 1: EDIT ACCOUNT DETAILS */}
          {mobileSubView === 'account' && (
            <form onSubmit={handleSaveAccount} className="space-y-4 pt-1" noValidate>
              <div className="flex items-center gap-3.5 pb-3 border-b border-white/[0.08]">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={fullName}
                    className="w-14 h-14 rounded-full object-cover border border-white/15 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#ff9000]/15 text-[#ff9000] flex items-center justify-center font-bold text-lg shrink-0">
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181f] border border-white/[0.1] text-xs font-medium text-white cursor-pointer"
                  >
                    <ImagePlus size={13} className="text-[#ff9000]" />
                    <span>Upload photo</span>
                  </button>
                  {photoURL && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-2 py-1.5 text-xs text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161d] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161d] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-10 px-3 rounded-xl bg-[#16161d] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Timezone</label>
                <GlassSelect
                  value={timezone}
                  onChange={(val) => setTimezone(val)}
                  options={TIMEZONES}
                  ariaLabel="Timezone"
                  direction="up"
                />
              </div>

              {savedMessage && (
                <div className="text-xs text-[#ff9000] font-medium flex items-center gap-1.5">
                  <Check size={14} strokeWidth={2.4} />
                  <span>{savedMessage}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileSubView(null)}
                  className="flex-1 h-10 rounded-xl bg-[#18181f] border border-white/[0.1] text-xs font-semibold text-white cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          {/* MOBILE SUB-VIEW 2: SECURITY & PIN */}
          {mobileSubView === 'security' && (
            <form onSubmit={handleSaveSecurity} className="space-y-4 pt-1" noValidate>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  6-Digit Security PIN
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setPinError('');
                    }}
                    placeholder={
                      hasConfiguredPin
                        ? 'PIN active — enter new 6-digit PIN to change'
                        : 'Enter 6-digit numeric PIN'
                    }
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-[#16161d] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white tracking-widest outline-none"
                  />
                  {hasConfiguredPin && (
                    <button
                      type="button"
                      onClick={async () => {
                        playRetroClick();
                        setPinInput('');
                        await onSavePin(null);
                        triggerSavedMessage('Security PIN removed');
                      }}
                      className="h-10 px-3 rounded-xl bg-[#18181f] border border-white/[0.1] text-xs text-red-400 font-medium shrink-0 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {pinError && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1.5">
                    <ShieldAlert size={12} />
                    <span>{pinError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Security Recovery Question
                </label>
                <GlassSelect
                  value={securityQuestion}
                  onChange={(val) => setSecurityQuestion(val)}
                  options={SECURITY_QUESTIONS.map((q) => ({ value: q, label: q }))}
                  ariaLabel="Recovery security question"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Recovery Answer
                </label>
                <input
                  type="password"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder={
                    hasConfiguredRecoveryAnswer
                      ? 'Recovery answer configured (enter new answer to update)'
                      : 'Enter a secret recovery answer'
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#16161d] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none"
                />
              </div>

              {savedMessage && (
                <div className="text-xs text-[#ff9000] font-medium flex items-center gap-1.5">
                  <Check size={14} strokeWidth={2.4} />
                  <span>{savedMessage}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileSubView(null)}
                  className="flex-1 h-10 rounded-xl bg-[#18181f] border border-white/[0.1] text-xs font-semibold text-white cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save security'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* =====================================================================
            DESKTOP VIEW (md+): TWO-COLUMN INDUSTRY-STANDARD SETTINGS LAYOUT
           ===================================================================== */}
        <div className="hidden md:flex w-full rounded-2xl bg-[#121216]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex-row min-h-[540px] overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="w-60 lg:w-64 bg-[#16161b]/95 border-r border-white/[0.07] p-5 flex flex-col justify-between shrink-0">
            <div>
              <div className="mb-6 px-2">
                <h2 className="font-title text-base font-bold text-white tracking-tight">
                  Settings
                </h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Manage your workspace</p>
              </div>

              <nav className="flex flex-col gap-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        playRetroClick();
                        setActiveSection(item.id);
                      }}
                      className={`group relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer w-full min-w-0 ${
                        isActive
                          ? 'bg-white/[0.08] text-white font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#ff9000]" />
                      )}
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                          isActive
                            ? 'bg-[#ff9000]/15 text-[#ff9000] border border-[#ff9000]/30'
                            : 'bg-white/[0.03] text-zinc-400 border border-white/[0.07] group-hover:text-zinc-200 group-hover:bg-white/[0.06]'
                        }`}
                      >
                        <Icon size={13} strokeWidth={2.2} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom User Profile & Sign Out */}
            <div className="flex mt-6 pt-4 border-t border-white/[0.07] items-center gap-3">
              <div className="shrink-0">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt={fullName}
                    className="w-9 h-9 rounded-lg object-cover border border-white/15"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[#ff9000]/15 border border-[#ff9000]/35 text-[#ff9000] flex items-center justify-center font-bold text-sm">
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{fullName}</div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 mt-0.5 text-[11px] font-medium text-zinc-400 hover:text-[#ff9000] transition-colors cursor-pointer"
                >
                  <LogOut size={12} strokeWidth={2.2} className="shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Right Content Area */}
          <div className="flex-1 p-8 flex flex-col justify-between bg-[#121216]/75 min-w-0">
            {/* TAB 1: ACCOUNT */}
            {activeSection === 'account' && (
              <form
                onSubmit={handleSaveAccount}
                className="flex-1 flex flex-col justify-between"
                noValidate
              >
                <div>
                  <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
                    <div className="min-w-0">
                      <h1 className="font-title text-lg font-bold text-white tracking-tight">
                        Account
                      </h1>
                      <p className="text-xs text-zinc-400 mt-1">
                        Update your profile photo, personal details, and regional preferences.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close settings"
                      className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.07]">
                    {/* Row 1: Profile Photo */}
                    <div className="py-6 flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">
                          Profile photo
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Displayed on your account badge in the navigation bar.
                        </p>
                      </div>
                      <div className="w-2/3 flex items-center gap-4 flex-wrap">
                        {photoURL ? (
                          <img
                            src={photoURL}
                            alt={fullName}
                            className="w-14 h-14 rounded-xl object-cover border border-white/15 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-[#ff9000]/15 border border-[#ff9000]/35 text-[#ff9000] flex items-center justify-center font-bold text-lg shrink-0">
                            {fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
                          >
                            <ImagePlus size={14} strokeWidth={2.2} className="text-[#ff9000]" />
                            <span>Upload photo</span>
                          </button>
                          {photoURL && (
                            <button
                              type="button"
                              onClick={handleRemovePhoto}
                              className="px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Full Name */}
                    <div className="py-6 flex items-start justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">Full name</div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Your primary display name across your bookmark vault.
                        </p>
                      </div>
                      <div className="w-2/3 grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                            First name
                          </label>
                          <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="First name"
                            className="w-full h-10 px-3.5 rounded-lg bg-[#18181f] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                            Last name
                          </label>
                          <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Last name"
                            className="w-full h-10 px-3.5 rounded-lg bg-[#18181f] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Email Address */}
                    <div className="py-6 flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">
                          Email address
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Account email used for cloud vault synchronization.
                        </p>
                      </div>
                      <div className="w-2/3">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full h-10 px-3.5 rounded-lg bg-[#18181f] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Row 4: Timezone */}
                    <div className="py-6 flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">Timezone</div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Used for bookmark timestamps and activity logs.
                        </p>
                      </div>
                      <div className="w-2/3 relative min-w-0">
                        <GlassSelect
                          value={timezone}
                          onChange={(val) => setTimezone(val)}
                          options={TIMEZONES}
                          ariaLabel="Timezone"
                          direction="up"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="pt-5 border-t border-white/[0.08] flex items-center justify-end gap-3">
                  {savedMessage && (
                    <span className="text-xs text-[#ff9000] font-medium mr-auto flex items-center gap-1.5">
                      <Check size={14} strokeWidth={2.4} />
                      <span>{savedMessage}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    onClick={handleSaveAccount}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-all cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: SECURITY & PIN */}
            {activeSection === 'security' && (
              <form
                onSubmit={handleSaveSecurity}
                className="flex-1 flex flex-col justify-between"
                noValidate
              >
                <div>
                  <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
                    <div className="min-w-0">
                      <h1 className="font-title text-lg font-bold text-white tracking-tight">
                        Security & PIN
                      </h1>
                      <p className="text-xs text-zinc-400 mt-1">
                        Manage your 6-digit vault passcode and security recovery question.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close settings"
                      className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.07]">
                    {/* Row 1: 6-Digit PIN */}
                    <div className="py-6 flex items-start justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">
                          6-Digit Security PIN
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Required to unlock your vault when switching browser tabs.
                        </p>
                      </div>
                      <div className="w-2/3 space-y-2.5">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="password"
                            maxLength={6}
                            value={pinInput}
                            onChange={(e) => {
                              setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                              setPinError('');
                            }}
                            placeholder={
                              hasConfiguredPin
                                ? 'PIN active — enter new 6-digit PIN to change'
                                : 'Enter 6-digit numeric PIN'
                            }
                            className="flex-1 min-w-0 h-10 px-3.5 rounded-lg bg-[#18181f] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white tracking-widest outline-none transition-colors"
                          />
                          {hasConfiguredPin && (
                            <button
                              type="button"
                              onClick={async () => {
                                playRetroClick();
                                setPinInput('');
                                await onSavePin(null);
                                triggerSavedMessage('Security PIN removed');
                              }}
                              className="h-10 px-3.5 rounded-lg bg-[#18181f] hover:bg-red-500/15 border border-white/[0.1] text-zinc-300 hover:text-red-400 text-xs font-medium transition-colors cursor-pointer shrink-0"
                            >
                              Remove PIN
                            </button>
                          )}
                        </div>
                        {pinError && (
                          <p className="text-[11px] text-red-400 flex items-center gap-1">
                            <ShieldAlert size={12} />
                            <span>{pinError}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Row 2: PIN Recovery Question Dropdown */}
                    <div className="py-6 flex items-start justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">
                          PIN Recovery Question
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Select a security question to reset your PIN if you forget it.
                        </p>
                      </div>
                      <div className="w-2/3 space-y-3.5 min-w-0">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                            Security Question
                          </label>
                          <GlassSelect
                            value={securityQuestion}
                            onChange={(val) => setSecurityQuestion(val)}
                            options={SECURITY_QUESTIONS.map((q) => ({ value: q, label: q }))}
                            ariaLabel="Recovery security question"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                            Recovery Answer
                          </label>
                          <input
                            type="password"
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.target.value)}
                            placeholder={
                              hasConfiguredRecoveryAnswer
                                ? 'Recovery answer configured (enter new answer to update)'
                                : 'Enter a secret recovery answer'
                            }
                            className="w-full h-10 px-3.5 rounded-lg bg-[#18181f] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Immediate Session Lock */}
                    <div className="py-6 flex items-center justify-between gap-4">
                      <div className="w-1/3">
                        <div className="font-title text-xs font-semibold text-white">
                          Lock Vault Session
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Immediately lock the vault screen on this device.
                        </p>
                      </div>
                      <div className="w-2/3">
                        <button
                          type="button"
                          onClick={onLockVault}
                          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          <LockKeyhole size={14} strokeWidth={2.2} className="text-[#ff9000]" />
                          <span>Lock Vault Now</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-white/[0.08] flex items-center justify-end gap-3">
                  {savedMessage && (
                    <span className="text-xs text-[#ff9000] font-medium mr-auto flex items-center gap-1.5">
                      <Check size={14} strokeWidth={2.4} />
                      <span>{savedMessage}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    onClick={handleSaveSecurity}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-all cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save security settings'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: VAULT TOOLS */}
            {activeSection === 'tools' && (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
                    <div className="min-w-0">
                      <h1 className="font-title text-lg font-bold text-white tracking-tight">
                        Vault Tools
                      </h1>
                      <p className="text-xs text-zinc-400 mt-1">
                        Import bookmarks, export vault backups, and manage session security.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close settings"
                      className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.07]">
                    {onScanQrClick && (
                      <div className="py-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                            <QrCode size={16} strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-title text-xs font-semibold text-white">
                              Scan / Enter Share Code
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              Import a shared category collection via QR image or share code.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onScanQrClick}
                          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                        >
                          Scan / Enter Code
                        </button>
                      </div>
                    )}

                    <div className="py-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                          <FileUp size={16} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-title text-xs font-semibold text-white">
                            Import Bookmarks
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Import HTML or JSON bookmark files from Chrome, Safari, Brave, or Edge.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onImportClick}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-all cursor-pointer shrink-0"
                      >
                        Import Bookmarks
                      </button>
                    </div>

                    <div className="py-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                          <HardDriveDownload size={16} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-title text-xs font-semibold text-white">
                            Export Backup
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Download all {linksCount} bookmarks and {categoriesCount} categories as
                            a backup file.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onExportClick}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                      >
                        Export Backup
                      </button>
                    </div>

                    <div className="py-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                          <ShieldCheck size={16} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-title text-xs font-semibold text-white">
                            {hasConfiguredPin ? 'Change Security PIN' : 'Set Security PIN'}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Configure your 6-digit PIN and security recovery question.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playRetroClick();
                          setActiveSection('security');
                        }}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                      >
                        {hasConfiguredPin ? 'Change Security PIN' : 'Set Security PIN'}
                      </button>
                    </div>

                    <div className="py-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                          <LockKeyhole size={16} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-title text-xs font-semibold text-white">
                            Lock Vault Session
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Lock your active session immediately and require PIN authentication.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onLockVault}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                      >
                        Lock Vault Session
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-white/[0.08] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: NOTIFICATIONS & PREFERENCES */}
            {activeSection === 'notifications' && (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
                    <div className="min-w-0">
                      <h1 className="font-title text-lg font-bold text-white tracking-tight">
                        Notifications
                      </h1>
                      <p className="text-xs text-zinc-400 mt-1">
                        Configure automatic tab lock, tactile sound effects, and visual feedback.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close settings"
                      className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.07]">
                    {[
                      {
                        title: 'Auto-Lock When Switching Tabs',
                        desc: 'Automatically lock your active vault session whenever you switch to another browser tab.',
                        icon: LockKeyhole,
                        checked: autoLockOnTabSwitch,
                        onChange: () => {
                          const next = !autoLockOnTabSwitch;
                          setAutoLockOnTabSwitch(next);
                          void onSaveProfile({ autoLockMinutes: next ? 1 : 0 });
                        },
                      },
                      {
                        title: 'Tactile Sound Effects',
                        desc: 'Play subtle audio clicks when unlocking the vault or interacting with controls.',
                        icon: Volume2,
                        checked: soundEffects,
                        onChange: () => {
                          const next = !soundEffects;
                          setSoundEffects(next);
                          void onSaveProfile({ soundEnabled: next });
                        },
                      },
                      {
                        title: 'Celebration Confetti',
                        desc: 'Show subtle confetti when saving new bookmarks or importing collections.',
                        icon: Sparkles,
                        checked: confettiOnSave,
                        onChange: () => {
                          const next = !confettiOnSave;
                          setConfettiOnSave(next);
                          void onSaveProfile({ confettiEnabled: next });
                        },
                      },
                    ].map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <div
                          key={item.title}
                          className="py-5 flex items-center justify-between gap-6"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#ff9000] flex items-center justify-center shrink-0">
                              <ItemIcon size={16} strokeWidth={2.2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-title text-xs font-semibold text-white">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={item.onChange}
                            aria-label={item.title}
                            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                              item.checked ? 'bg-[#ff9000]' : 'bg-zinc-700'
                            }`}
                          >
                            <div
                              className={`w-4.5 h-4.5 rounded-full bg-black transition-transform ${
                                item.checked ? 'translate-x-4.5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-5 border-t border-white/[0.08] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-[#18181f] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
