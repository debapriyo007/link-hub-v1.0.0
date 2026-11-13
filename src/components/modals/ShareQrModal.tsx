import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download } from 'lucide-react';
import { Category, LinkItem } from '../../types.ts';
import { extractDomain } from '../../utils/vaultLogic.ts';
import { encodeCategorySharePayload } from '../../utils/categoryShare.ts';
import { playRetroClick } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { GlassSelect } from '../ui/GlassSelect.tsx';

interface ShareQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  links: LinkItem[];
  initialCategorySlug?: string;
  onShowToast: (msg: string) => void;
}

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

  const shareData = useMemo(() => {
    return encodeCategorySharePayload(activeCategoryMeta, categoryLinks);
  }, [activeCategoryMeta, categoryLinks]);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        shareData.shareUrl,
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
  }, [isOpen, shareData]);

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
      label: `All Bookmarks (${links.length} link${links.length === 1 ? '' : 's'})`,
    },
  ];

  const handleCopyShortCode = () => {
    playRetroClick();
    navigator.clipboard.writeText(shareData.shareCode);
    setCopiedCode(true);
    onShowToast('Share code copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyFullToken = () => {
    playRetroClick();
    navigator.clipboard.writeText(shareData.shareUrl);
    setCopiedToken(true);
    onShowToast('Share link copied!');
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleDownloadQr = () => {
    playRetroClick();
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `linkhub-category-${activeCategoryMeta.slug}-${shareData.shareCode}.png`;
      a.click();
      onShowToast('QR code downloaded!');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <div className="flex flex-col">
          <span className="font-title font-bold text-white tracking-tight text-sm sm:text-base">
            Share Category via QR & Code
          </span>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 py-4">
        {/* Category Selector */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Select Category Collection
          </label>
          <GlassSelect
            value={selectedSlug}
            onChange={(val) => setSelectedSlug(val)}
            options={selectOptions}
            ariaLabel="Select category to share"
          />
        </div>

        {/* Center QR & Share Code Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-white/[0.025] border border-white/[0.08]">
          {/* Left: High-Contrast QR Code */}
          <div className="sm:col-span-5 flex flex-col items-center justify-center">
            <div className="p-2.5 bg-white rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.6)] border border-white/20 flex items-center justify-center">
              <canvas ref={canvasRef} className="rounded-md block" />
            </div>
            <span className="text-[11px] text-zinc-400 mt-2 text-center font-medium">
              Scan to import {categoryLinks.length} link{categoryLinks.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Right: Share Code & Included Links Preview */}
          <div className="sm:col-span-7 flex flex-col justify-between space-y-3 text-left">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-title font-bold text-[#ff9000]">
                Category Share Code
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Scan this QR code or enter the code below on another device to import this category collection.
              </p>
            </div>

            {/* Share Code Box */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.1]">
              <span className="font-mono font-bold text-sm text-white tracking-wider select-all">
                {shareData.shareCode}
              </span>
              <button
                type="button"
                onClick={handleCopyShortCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-colors cursor-pointer shrink-0"
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Portable Token Copy */}
            <button
              type="button"
              onClick={handleCopyFullToken}
              className="w-full py-1.5 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedToken ? <Check size={12} className="text-[#ff9000]" /> : <Copy size={12} />}
              <span>{copiedToken ? 'Portable Share Token Copied' : 'Copy Portable Share Token'}</span>
            </button>

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
