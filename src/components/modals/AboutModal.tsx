import React from 'react';
import { Info, Shield, HardDrive, QrCode } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Chip } from '../ui/Chip.tsx';
import { LinkHubLogo } from '../LinkHubLogo.tsx';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#ff9000]/15 border border-[#ff9000]/30 text-[#ff9000] flex items-center justify-center">
            <Info size={14} strokeWidth={2.2} />
          </div>
          <span className="font-title font-bold text-white tracking-tight">
            About LINKHUB
          </span>
        </div>
      </ModalHeader>

      <ModalBody className="flex flex-col items-center py-4 text-center">
        <div className="mb-3">
          <LinkHubLogo size="lg" withTagline={true} />
        </div>

        <Chip size="sm" variant="flat" className="mb-3 bg-[#ff9000]/15 text-[#ff9000] font-bold">
          High Performance Link Vault
        </Chip>

        <p className="text-xs text-zinc-300 leading-relaxed mb-4">
          Save, organize, and categorize mission-critical links with PIN passcode security, Category Collection QR & Share Code transfers, and browser bookmark compatibility.
        </p>

        <div className="w-full p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.08] text-[11px] text-zinc-400 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HardDrive size={12} className="text-[#ff9000]" />
              <span>Storage Engine:</span>
            </span>
            <span className="font-mono font-semibold text-zinc-200">Cloud Sync + Local Cache</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <QrCode size={12} className="text-[#ff9000]" />
              <span>Category Sharing:</span>
            </span>
            <span className="font-mono font-semibold text-zinc-200">QR Code + Share Code</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Shield size={12} className="text-[#ff9000]" />
              <span>Security:</span>
            </span>
            <span className="font-mono font-semibold text-[#ff9000]">6-Digit Encrypted Lock</span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 mt-4 uppercase tracking-wider font-semibold">
          CREATED BY <strong className="font-black text-[#ff9000]">@DEBU-21</strong> • ALL RIGHTS RESERVED &copy; 2026
        </p>
      </ModalBody>

      <ModalFooter>
        <Button color="primary" variant="solid" size="sm" className="w-full font-bold" onClick={onClose}>
          Got it
        </Button>
      </ModalFooter>
    </Modal>
  );
};
