import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, ShieldCheck, LockKeyhole, RefreshCw, Ban } from 'lucide-react';
import { Category, LinkItem } from '../../types.ts';
import { extractDomain } from '../../utils/vaultLogic.ts';
import {
  createServerCategoryShare,
  encodeCategorySharePayload,
  revokeServerCategoryShare,
} from '../../utils/categoryShare.ts';
import { playRetroClick, playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { GlassSelect } from '../ui/GlassSelect.tsx';

interface ShareQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  links: LinkItem[];
  initialCategorySlug?: string;
  onShowToast: (msg: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
}

const TTL_OPTIONS = [
  { value: '24', label: 'Expires in 24 Hours' },
  { value: '168', label: 'Expires in 7 Days' },
  { value: '720', label: 'Expires in 30 Days' },
];

export const ShareQrModal: React.FC<ShareQrModalProps> = ({
  isOpen,
  onClose,
  categories,
  links,
  initialCategorySlug,
  onShowToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>('all');
  const [ttlHours, setTtlHours] = useState<string>('168');
  const [password, setPassword] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [revoking, setRevoking] = useState<boolean>(false);
  const [serverShare, setServerShare] = useState<{
    shareToken: string;
    shareUrl: string;
    expiresAt: number;
    hasPassword: boolean;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (
        initialCategorySlug &&
        initialCategorySlug !== 'starred' &&
        (initialCategorySlug === 'all' || categories.some((c) => c.slug === initialCategorySlug))
      ) {
        setSelectedSlug(initialCategorySlug);
      } else if (categories.length > 0) {
        setSelectedSlug(categories[0].slug);
      } else {
        setSelectedSlug('all');
      }
      setPassword('');
      setServerShare(null);
      setCopiedCode(false);
      setCopiedToken(false);
    }
  }, [isOpen, initialCategorySlug, categories]);

  const activeCategoryMeta = useMemo(() => {
    if (selectedSlug === 'all') {
      return {
        name: 'All Vault Bookmarks',
        slug: 'all',
        icon: 'folder',
        color: '#ff9000',
      };
    }
    const found = categories.find((c) => c.slug === selectedSlug);
    return (
      found || {
        name: 'Shared Collection',
        slug: selectedSlug,
        icon: 'folder',
        color: '#ff9000',
      }
    );
  }, [selectedSlug, categories]);

  const categoryLinks = useMemo(() => {
    if (selectedSlug === 'all') return links;
    return links.filter((l) => l.categorySlug === selectedSlug);
  }, [selectedSlug, links]);

  const portableFallback = useMemo(() => {
    return encodeCategorySharePayload(activeCategoryMeta, categoryLinks);
  }, [activeCategoryMeta, categoryLinks]);

  const activeQrTargetUrl = serverShare ? serverShare.shareUrl : portableFallback.shareUrl;
  const activeShareDisplayCode = serverShare ? serverShare.shareToken : portableFallback.shareUrl;

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        activeQrTargetUrl,
        {
          width: 168,
          margin: 2,
          errorCorrectionLevel: 'L',
          color: {
            dark: '#09090b',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('QR render error:', error);
        }
      );
    }
  }, [isOpen, activeQrTargetUrl]);

  if (!isOpen) return null;

  const selectOptions = [
    ...categories.map((cat) => {
      const count = links.filter((l) => l.categorySlug === cat.slug).length;
      return {
        value: cat.slug,
        label: `${cat.name} (${count} link${count === 1 ? '' : 's'})`,
      };
    }),
    {
      value: 'all',
      label: `All Public Bookmarks (${links.length} link${links.length === 1 ? '' : 's'})`,
    },
  ];

  const handleGenerateSecureShare = async () => {
    if (categoryLinks.length === 0) {
      playRetroBeep();
      onShowToast('Add at least one bookmark to generate a share link.', 'warning');
      return;
    }
    playRetroClick();
    setCreating(true);
    try {
      const created = await createServerCategoryShare({
        category: activeCategoryMeta,
        links: categoryLinks,
        ttlHours: Number(ttlHours) || 168,
        password: password.trim() || undefined,
      });
      setServerShare(created);
      playRetroUnlockChime();
      onShowToast(
        created.hasPassword
          ? 'Password-protected share link generated!'
          : 'Secure expiring share link generated!',
        'success'
      );
    } catch (err) {
      playRetroBeep();
      onShowToast(
        err instanceof Error ? err.message : 'Could not create server share link.',
        'error'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!serverShare) return;
    playRetroClick();
    setRevoking(true);
    try {
      await revokeServerCategoryShare(serverShare.shareToken);
      setServerShare(null);
      onShowToast('Share link revoked!', 'success');
    } catch (err) {
      playRetroBeep();
      onShowToast(err instanceof Error ? err.message : 'Could not revoke link.', 'error');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyShortCode = () => {
    playRetroClick();
    navigator.clipboard.writeText(activeShareDisplayCode);
    setCopiedCode(true);
    onShowToast(serverShare ? 'Share token copied!' : 'Portable share token copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyFullToken = () => {
    playRetroClick();
    navigator.clipboard.writeText(activeQrTargetUrl);
    setCopiedToken(true);
    onShowToast('Share URL copied!');
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleDownloadQr = () => {
    playRetroClick();
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const suffix = serverShare ? serverShare.shareToken.slice(0, 12) : 'portable';
      a.download = `linkhub-category-${activeCategoryMeta.slug}-${suffix}.png`;
      a.click();
      onShowToast('QR code downloaded!');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex flex-col">
          <span className="font-title font-bold text-white tracking-tight text-sm sm:text-base">
            Share Category via Secure Link &amp; QR
          </span>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 py-4">
        {/* Category Selector & Expiry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Select Collection
            </label>
            <GlassSelect
              value={selectedSlug}
              onChange={(val) => {
                setSelectedSlug(val);
                setServerShare(null);
              }}
              options={selectOptions}
              ariaLabel="Select category to share"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Expiration Policy
            </label>
            <GlassSelect
              value={ttlHours}
              onChange={(val) => setTtlHours(val)}
              options={TTL_OPTIONS}
              ariaLabel="Select share link expiration"
            />
          </div>
        </div>

        {/* Optional Password & Generate Server Share Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="relative flex-1">
            <LockKeyhole
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Optional share password"
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-white/[0.03] border border-white/[0.09] focus:border-[#ff9000] text-xs text-white placeholder:text-zinc-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerateSecureShare}
            disabled={creating || categoryLinks.length === 0}
            className="h-9 px-3.5 rounded-xl bg-[#ff9000] hover:bg-[#ffa31a] disabled:opacity-50 text-black font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={12} className={creating ? 'animate-spin' : ''} />
            <span>
              {creating
                ? 'Generating...'
                : serverShare
                  ? 'Rotate Share Token'
                  : 'Create Secure Share Link'}
            </span>
          </button>
        </div>

        {/* Center QR & Share Code Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
          {/* Left: High-Contrast QR Code */}
          <div className="sm:col-span-5 flex flex-col items-center justify-center">
            <div className="p-2.5 bg-white rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.6)] border border-white/20 flex items-center justify-center">
              <canvas ref={canvasRef} className="rounded-md block" />
            </div>
            <span className="text-[11px] text-zinc-400 mt-2 text-center font-medium">
              {serverShare
                ? `High-entropy read-only link (${categoryLinks.length} links)`
                : `Portable offline QR (${categoryLinks.length} links)`}
            </span>
          </div>

          {/* Right: Share Token & Included Links Preview */}
          <div className="sm:col-span-7 flex flex-col justify-between space-y-3 text-left">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-title font-bold text-[#ff9000] flex items-center gap-1.5">
                <ShieldCheck size={12} />
                <span>
                  {serverShare ? 'Server-Enforced Share Token' : 'Portable Fallback Token'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                {serverShare
                  ? `Expires ${new Date(serverShare.expiresAt).toLocaleString()}${serverShare.hasPassword ? ' • Password Protected' : ''}. Can be revoked anytime.`
                  : 'Click "Create Secure Share Link" above for an expiring, revocable, optionally password-protected server link.'}
              </p>
            </div>

            {/* Token Box */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.1]">
              <span className="font-mono font-bold text-xs text-white truncate select-all">
                {serverShare ? serverShare.shareToken : portableFallback.qrPayload.slice(0, 26) + '...'}
              </span>
              <button
                type="button"
                onClick={handleCopyShortCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-colors cursor-pointer shrink-0"
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCode ? 'Copied' : 'Copy Token'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyFullToken}
                className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedToken ? <Check size={12} className="text-[#ff9000]" /> : <Copy size={12} />}
                <span>{copiedToken ? 'Share URL Copied' : 'Copy Share URL'}</span>
              </button>

              {serverShare && (
                <button
                  type="button"
                  onClick={handleRevokeShare}
                  disabled={revoking}
                  className="py-1.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Ban size={12} />
                  <span>{revoking ? 'Revoking...' : 'Revoke'}</span>
                </button>
              )}
            </div>

            {/* Included Links Mini List */}
            <div className="pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                <span>Included Bookmarks</span>
                <span className="font-mono text-zinc-300">{categoryLinks.length}</span>
              </div>
              <div className="max-h-20 overflow-y-auto space-y-1 pr-1">
                {categoryLinks.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 italic">No links in this category yet.</p>
                ) : (
                  categoryLinks.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs text-zinc-300 py-0.5"
                    >
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="text-zinc-500 font-mono text-[10px] shrink-0">
                        {extractDomain(item.url)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center w-full">
        <Button size="sm" variant="flat" color="default" onClick={onClose}>
          Close
        </Button>
        <Button
          size="sm"
          color="primary"
          variant="solid"
          onClick={handleDownloadQr}
          disabled={categoryLinks.length === 0}
          startContent={<Download size={13} />}
        >
          Download QR PNG
        </Button>
      </ModalFooter>
    </Modal>
  );
};
