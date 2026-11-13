import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { LinkItem } from '../../types.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Kbd } from '../ui/Kbd.tsx';
import { IncognitoIcon } from '../ui/IncognitoIcon.tsx';

interface IncognitoModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: LinkItem | null;
  onShowToast: (message: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
}

interface StealthReaderResult {
  ok: boolean;
  domain: string;
  title?: string;
  summary?: string;
  paragraphs: string[];
  reason?: string;
}

export const IncognitoModal: React.FC<IncognitoModalProps> = ({
  isOpen,
  onClose,
  link,
  onShowToast,
}) => {
  const [copiedNow, setCopiedNow] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerData, setReaderData] = useState<StealthReaderResult | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopiedNow(false);
      setReaderOpen(false);
      setReaderLoading(false);
      setReaderData(null);
    }
  }, [isOpen, link?.id]);

  if (!isOpen || !link) return null;

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');
  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

  const handleCopyExplicit = () => {
    navigator.clipboard?.writeText(link.url).catch(() => {});
    setCopiedNow(true);
    onShowToast('Link copied!', 'success');
    window.setTimeout(() => setCopiedNow(false), 1800);
  };

  const handleLoadStealthReader = async () => {
    setReaderOpen(true);
    if (readerData || readerLoading) return;
    setReaderLoading(true);
    try {
      const res = await fetch('/api/stealth/reader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link.url }),
      });
      const json: StealthReaderResult = await res.json();
      setReaderData(json);
    } catch {
      setReaderData({
        ok: false,
        domain: link.url,
        paragraphs: [],
        reason: 'Could not reach Stealth Reader right now.',
      });
    } finally {
      setReaderLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={readerOpen ? 'lg' : 'md'}>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#202127] border border-white/15 text-white flex items-center justify-center shadow-inner">
            <IncognitoIcon size={16} />
          </div>
          <div className="min-w-0">
            <span className="font-title font-bold text-white tracking-tight text-sm block leading-tight">
              Private / Incognito Launch
            </span>
            <span className="text-[11.5px] tracking-normal text-zinc-400 block leading-tight mt-0.5">
              Zero browser history &bull; Zero vault tracking
            </span>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* Target Link Summary Card */}
        <div className="p-3.5 rounded-2xl bg-[#15161b] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-title font-bold text-white truncate">
              {link.title}
            </h4>
            <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">
              {link.url}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyExplicit}
            title="Copy URL to paste into Private window"
            aria-label="Copy URL"
            className="h-9 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            {copiedNow ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Industry-Standard Private Launch Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Option 1: In-App Zero-History Stealth Reader */}
          <button
            type="button"
            onClick={handleLoadStealthReader}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
              readerOpen
                ? 'bg-[#ff9000]/12 border-[#ff9000]/45'
                : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.09] hover:border-[#ff9000]/40'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.1] text-zinc-200 flex items-center justify-center shrink-0">
              <BookOpen size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-title font-bold text-white">
                Stealth Reader Preview
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug mt-1">
                Read cleanly inside LINKHUB without cookies, trackers, or browser history.
              </p>
            </div>
          </button>

          {/* Option 2: Native Browser Private Tab Target */}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            onClick={() => {
              onShowToast('Opened with zero referrer!', 'info');
              onClose();
            }}
            className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.09] hover:border-white/25 text-left transition-all cursor-pointer flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.1] text-zinc-200 flex items-center justify-center shrink-0">
              <ExternalLink size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-title font-bold text-white">
                {isAndroid ? 'Hold → Open Private Tab' : 'Right-Click → Private Window'}
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug mt-1">
                Tap to launch isolated (<code className="text-zinc-300">no-referrer</code>), or{' '}
                {isAndroid ? 'long-press' : 'right-click'} for browser Incognito.
              </p>
            </div>
          </a>
        </div>

        {/* Stealth Reader Output Panel (Mounted On Demand) */}
        {readerOpen && (
          <div className="rounded-2xl bg-[#0e0f13] border border-white/[0.09] p-4 max-h-64 overflow-y-auto space-y-2.5">
            {readerLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-400">
                <Loader2 size={15} className="animate-spin text-[#ff9000]" />
                <span>Fetching tracker-free stealth preview...</span>
              </div>
            ) : readerData?.ok && readerData.paragraphs.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.07]">
                  <span className="text-xs font-title font-bold text-white truncate">
                    {readerData.title || link.title}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {readerData.domain}
                  </span>
                </div>
                {readerData.summary && (
                  <p className="text-xs text-[#ff9000]/90 font-medium leading-relaxed">
                    {readerData.summary}
                  </p>
                )}
                <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                  {readerData.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-zinc-400 py-3 text-center space-y-1.5">
                <p className="font-semibold text-zinc-200">
                  Interactive login or protected page
                </p>
                <p>
                  {readerData?.reason ||
                    'This site blocks server-side previews. Use Copy or right-click/long-press above to open directly in your Private window.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Transparent Browser Security Guidance */}
        <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-3 text-[11px] text-zinc-400">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={14} className="text-zinc-400 shrink-0" />
            <span className="leading-snug">
              Web browsers restrict auto-spawning Incognito tabs from JavaScript for security.
            </span>
          </div>
          {!isAndroid && (
            <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-zinc-300">
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>Shift</Kbd>+<Kbd>N</Kbd>
            </span>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="flat" color="default" size="sm" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};
