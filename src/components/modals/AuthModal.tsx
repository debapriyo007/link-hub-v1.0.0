import React from 'react';
import {
  ShieldCheck,
  X,
  LogOut,
  Key,
  Cloud,
  Bookmark,
  Folder,
  Star,
  RotateCcw,
} from 'lucide-react';
import { UserProfile } from '../../types.ts';
import { Modal } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Chip } from '../ui/Chip.tsx';
import { LinkHubLogo } from '../LinkHubLogo.tsx';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  linksCount: number;
  categoriesCount: number;
  favoritesCount: number;
  hasPin: boolean;
  onOpenPinModal: () => void;
  onSeedStarterData: () => void;
  onSignOut: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  linksCount,
  categoriesCount,
  favoritesCount,
  hasPin,
  onOpenPinModal,
  onSeedStarterData,
  onSignOut,
}) => {
  if (!isOpen || !currentUser) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      className="bg-[#121212] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Top Accent Bar */}
      <div className="h-1 w-full bg-gradient-to-r from-[#ff9000]/40 via-[#ff9000] to-[#ff9000]/40" />

      {/* Header with Close Button and Prominent LINKHUB Logo */}
      <div className="relative pt-6 pb-4 px-6 flex flex-col items-center text-center border-b border-[#1f1f1f] bg-[#141414]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>

        <LinkHubLogo size="md" />
        <p className="text-[11px] text-zinc-400 mt-1.5 font-medium uppercase tracking-wider">
          Account &amp; Vault Settings
        </p>
      </div>

      <div className="p-6 space-y-5 bg-[#121212]">
        {/* User Profile Identity */}
        <div className="flex flex-col items-center text-center">
          {currentUser.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt={currentUser.displayName}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-[#ff9000] mb-3 shadow-lg shadow-[#ff9000]/15"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border-2 border-[#ff9000] text-[#ff9000] font-black text-2xl flex items-center justify-center mb-3 shadow-lg shadow-[#ff9000]/15">
              {currentUser.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <h3 className="font-title font-bold text-white text-base tracking-tight">
            {currentUser.displayName}
          </h3>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {currentUser.email}
          </p>

          <Chip
            color="warning"
            variant="flat"
            size="sm"
            className="mt-3 bg-[#ff9000]/15 text-[#ff9000] font-bold uppercase tracking-wider"
          >
            <Cloud size={11} className="mr-1 inline" />
            Account Synced
          </Chip>
        </div>

        {/* Live Cloud Vault Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-[#181818] border border-[#262626] flex flex-col items-center text-center">
            <Bookmark size={14} className="text-[#ff9000] mb-1" />
            <span className="font-mono font-bold text-base text-white">{linksCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Links
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#181818] border border-[#262626] flex flex-col items-center text-center">
            <Star size={14} className="text-[#ff9000] mb-1" />
            <span className="font-mono font-bold text-base text-white">{favoritesCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Favorites
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#181818] border border-[#262626] flex flex-col items-center text-center">
            <Folder size={14} className="text-[#ff9000] mb-1" />
            <span className="font-mono font-bold text-base text-white">{categoriesCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Categories
            </span>
          </div>
        </div>

        {/* Account Actions */}
        <div className="space-y-2.5 pt-1">
          <Button
            variant="flat"
            color="default"
            size="md"
            onClick={() => {
              onClose();
              onOpenPinModal();
            }}
            className="w-full h-10 text-xs font-bold uppercase tracking-wider bg-[#1a1a1a] hover:bg-[#242424] text-zinc-200 border border-[#2b2b2b]"
            startContent={<Key size={14} className="text-[#ff9000]" />}
          >
            {hasPin ? 'Manage 6-Digit Security PIN' : 'Enable 6-Digit Security PIN'}
          </Button>

          {linksCount === 0 && (
            <Button
              variant="flat"
              color="primary"
              size="md"
              onClick={() => {
                onSeedStarterData();
                onClose();
              }}
              className="w-full h-10 text-xs font-bold uppercase tracking-wider"
              startContent={<RotateCcw size={14} />}
            >
              Load Starter Bookmarks
            </Button>
          )}

          <Button
            color="danger"
            variant="flat"
            size="md"
            onClick={() => {
              onSignOut();
              onClose();
            }}
            className="w-full h-10 text-xs font-bold uppercase tracking-wider"
            startContent={<LogOut size={14} />}
          >
            Sign Out of LINKHUB
          </Button>
        </div>
      </div>

      {/* Subtle Security Footer */}
      <div className="px-6 py-3 bg-[#0e0e0e] border-t border-[#1f1f1f] flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 font-medium">
        <ShieldCheck size={13} className="text-[#ff9000]" />
        <span>Private &amp; Encrypted Personal Vault</span>
      </div>
    </Modal>
  );
};


