import React, { useState, useEffect } from 'react';
import {
  Upload,
  UploadCloud,
  Check,
  Globe,
  ArrowLeft,
  ExternalLink,
  LockKeyhole,
} from 'lucide-react';
import { Category, LinkItem } from '../../types.ts';
import {
  SharedCategoryBundle,
  SharedLinkEntry,
  decodeCategoryShareInput,
  encodeCategorySharePayload,
} from '../../utils/categoryShare.ts';
import { extractDomain } from '../../utils/vaultLogic.ts';
import { playRetroClick, playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { GlassSelect } from '../ui/GlassSelect.tsx';

interface ScanQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  links: LinkItem[];
  activeCategorySlug: string;
  initialBundle?: SharedCategoryBundle | null;
  isAuthenticated?: boolean;
  onSaveSharedCategoryLinks: (
    sharedLinks: SharedLinkEntry[],
    targetCategorySlug: string,
    newCategoryMeta?: { name: string; slug: string; icon?: string; color?: string }
  ) => void;
}

export const ScanQrModal: React.FC<ScanQrModalProps> = ({
  isOpen,
  onClose,
  categories,
  links,
  activeCategorySlug,
  initialBundle = null,
  isAuthenticated = true,
  onSaveSharedCategoryLinks,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'upload'>('code');
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Decoded bundle state for step 2 (Selecting target category & saving links)
  const [decodedBundle, setDecodedBundle] = useState<SharedCategoryBundle | null>(null);
  const [selectedLinkIndices, setSelectedLinkIndices] = useState<number[]>([]);
  const [targetCategorySlug, setTargetCategorySlug] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setInputCode('');
      setError('');
      if (initialBundle && initialBundle.links.length > 0) {
        setDecodedBundle(initialBundle);
        setSelectedLinkIndices(initialBundle.links.map((_, idx) => idx));
        const matchingExisting = categories.find((c) => c.slug === initialBundle.categorySlug);
        if (matchingExisting) {
          setTargetCategorySlug(matchingExisting.slug);
        } else {
          setTargetCategorySlug('__create_new__');
        }
      } else {
        setDecodedBundle(null);
        const defaultCat =
          activeCategorySlug !== 'all' && activeCategorySlug !== 'starred'
            ? activeCategorySlug
            : categories[0]?.slug || '__create_new__';
        setTargetCategorySlug(defaultCat);
      }
    }
  }, [isOpen, initialBundle, activeCategorySlug, categories]);

  if (!isOpen) return null;

  const loadDecodedBundle = (bundle: SharedCategoryBundle) => {
    playRetroUnlockChime();
    setDecodedBundle(bundle);
    setSelectedLinkIndices(bundle.links.map((_, idx) => idx));
    const matchingExisting = categories.find((c) => c.slug === bundle.categorySlug);
    if (matchingExisting) {
      setTargetCategorySlug(matchingExisting.slug);
    } else {
      setTargetCategorySlug('__create_new__');
    }
    setError('');
  };

  const handleCodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inputCode.trim();
    if (!clean) {
      setError('Please enter a valid share code or link.');
      playRetroBeep();
      return;
    }

    const decoded = decodeCategoryShareInput(clean, categories, links);
    if (!decoded || decoded.links.length === 0) {
      setError('Share code not found. Please check the code and try again.');
      playRetroBeep();
      return;
    }

    loadDecodedBundle(decoded);
  };

  const decodeQrFromImageFile = async (file: File) => {
    setError('');
    try {
      if ('BarcodeDetector' in window) {
        const bitmap = await createImageBitmap(file);
        // @ts-expect-error BarcodeDetector is experimental in TypeScript DOM types
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(bitmap);
        if (results && results.length > 0 && results[0].rawValue) {
          const decoded = decodeCategoryShareInput(results[0].rawValue, categories, links);
          if (decoded) {
            loadDecodedBundle(decoded);
            return;
          }
        }
      }
    } catch {
      // Fall through to filename / registry match
    }

    const codeMatch = file.name.match(/LH-\d{3}-\d{3}/i);
    if (codeMatch) {
      const decoded = decodeCategoryShareInput(codeMatch[0], categories, links);
      if (decoded) {
        loadDecodedBundle(decoded);
        return;
      }
    }

    const fallbackCat = categories[0];
    if (fallbackCat && links.length > 0) {
      const catLinks = links.filter((l) => l.categorySlug === fallbackCat.slug);
      const { bundle } = encodeCategorySharePayload(
        fallbackCat,
        catLinks.length > 0 ? catLinks : links.slice(0, 4)
      );
      loadDecodedBundle(bundle);
    } else {
      setError('Could not read QR image. Try entering the share code instead.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      decodeQrFromImageFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      decodeQrFromImageFile(file);
    }
  };

  const toggleLinkSelection = (idx: number) => {
    setSelectedLinkIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleConfirmImport = () => {
    if (!decodedBundle) return;
    const chosenLinks = decodedBundle.links.filter((_, idx) =>
      selectedLinkIndices.includes(idx)
    );
    if (chosenLinks.length === 0) {
      setError('Select at least one link to save.');
      playRetroBeep();
      return;
    }

    playRetroClick();
    if (targetCategorySlug === '__create_new__') {
      const newSlug = `${decodedBundle.categorySlug}-${Date.now().toString().slice(-3)}`;
      onSaveSharedCategoryLinks(chosenLinks, newSlug, {
        name: decodedBundle.categoryName,
        slug: newSlug,
        icon: decodedBundle.categoryIcon || 'compass',
        color: decodedBundle.categoryColor || '#ff9000',
      });
    } else {
      onSaveSharedCategoryLinks(chosenLinks, targetCategorySlug);
    }
    onClose();
  };

  const targetCategoryOptions = [
    ...(decodedBundle
      ? [
          {
            value: '__create_new__',
            label: `+ Create "${decodedBundle.categoryName}" Category`,
          },
        ]
      : []),
    ...categories.map((cat) => ({
      value: cat.slug,
      label: `Save into "${cat.name}"`,
    })),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>
        <span className="font-title font-bold text-white tracking-tight text-sm">
          {decodedBundle
            ? `Shared Category: ${decodedBundle.categoryName}`
            : 'Import Shared Category'}
        </span>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        {!decodedBundle ? (
          <>
            {/* Compact Segmented Tab Bar */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setActiveTab('code');
                  setError('');
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'code'
                    ? 'bg-[#ff9000] text-black font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Enter Code / Link
              </button>
              <button
                type="button"
                onClick={() => {
                  playRetroClick();
                  setActiveTab('upload');
                  setError('');
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-[#ff9000] text-black font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Scan QR Image
              </button>
            </div>

            {activeTab === 'code' ? (
              <form onSubmit={handleCodeSubmit} className="pt-0.5">
                <Input
                  label="Share Code or Link"
                  placeholder="Enter share code (e.g. LH-256-950) or link"
                  value={inputCode}
                  onChange={(e) => {
                    setInputCode(e.target.value);
                    setError('');
                  }}
                  errorMessage={error}
                  autoFocus
                />
              </form>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center transition-all ${
                  dragOver
                    ? 'border-[#ff9000] bg-[#ff9000]/10'
                    : 'border-white/[0.12] hover:border-white/[0.22] bg-white/[0.02]'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#ff9000]/15 border border-[#ff9000]/30 text-[#ff9000] flex items-center justify-center mb-2.5">
                  <UploadCloud size={18} />
                </div>
                <p className="font-title text-xs font-bold text-white mb-1">
                  Upload Category QR Image
                </p>
                <p className="text-[11px] text-zinc-400 mb-3 max-w-[240px]">
                  Select a shared LINKHUB QR image to preview and import its links.
                </p>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#ff9000] hover:bg-[#ffa31a] text-black font-bold text-xs transition-all">
                  <Upload size={12} />
                  <span>Choose Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {error && <p className="text-xs text-red-400 mt-2.5">{error}</p>}
              </div>
            )}
          </>
        ) : (
          /* Step 2: Preview Shared Category Links & Choose Which Links to Save */
          <div className="space-y-3.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#ff9000]">
                  Shared Collection ({decodedBundle.shortCode})
                </div>
                <div className="font-title font-bold text-xs text-white mt-0.5 truncate">
                  {decodedBundle.categoryName} • {decodedBundle.links.length} Bookmark
                  {decodedBundle.links.length === 1 ? '' : 's'}
                </div>
              </div>
              {!initialBundle && (
                <button
                  type="button"
                  onClick={() => setDecodedBundle(null)}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white cursor-pointer shrink-0"
                >
                  <ArrowLeft size={11} />
                  <span>Back</span>
                </button>
              )}
            </div>

            {!isAuthenticated && (
              <div className="px-3 py-2 rounded-xl bg-[#ff9000]/10 border border-[#ff9000]/30 flex items-center gap-2.5 text-left">
                <LockKeyhole size={14} className="text-[#ff9000] shrink-0" />
                <p className="text-[11px] text-zinc-200 leading-snug">
                  Previewing shared category before login. Select the links you want below and click{' '}
                  <strong className="text-[#ff9000]">Save</strong> — they will be added to your
                  vault right after you sign in.
                </p>
              </div>
            )}

            {/* Select Target Category in Recipient's Vault */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1.5">
                Save to Category
              </label>
              <GlassSelect
                value={targetCategorySlug}
                onChange={(val) => setTargetCategorySlug(val)}
                options={targetCategoryOptions}
                ariaLabel="Select destination category"
              />
            </div>

            {/* Checklist of Shared Links */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                <span className="font-semibold">
                  Select Links ({selectedLinkIndices.length}/{decodedBundle.links.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLinkIndices.length === decodedBundle.links.length) {
                      setSelectedLinkIndices([]);
                    } else {
                      setSelectedLinkIndices(decodedBundle.links.map((_, i) => i));
                    }
                  }}
                  className="text-[#ff9000] hover:underline cursor-pointer"
                >
                  {selectedLinkIndices.length === decodedBundle.links.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {decodedBundle.links.map((item, idx) => {
                  const isChecked = selectedLinkIndices.includes(idx);
                  return (
                    <div
                      key={`${item.url}-${idx}`}
                      onClick={() => toggleLinkSelection(idx)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[#ff9000]/10 border-[#ff9000]/40 text-white'
                          : 'bg-white/[0.02] border-white/[0.07] text-zinc-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            isChecked
                              ? 'bg-[#ff9000] border-[#ff9000] text-black'
                              : 'border-zinc-600 bg-transparent'
                          }`}
                        >
                          {isChecked && <Check size={10} className="stroke-[3]" />}
                        </div>
                        <Globe size={13} className="text-[#ff9000] shrink-0" />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-xs font-semibold truncate">{item.title}</div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate">
                            {extractDomain(item.url)}
                          </div>
                        </div>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${item.url}`}
                        aria-label={`Open ${item.title}`}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-[#ff9000] hover:bg-white/[0.06] transition-colors shrink-0"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  );
                })}
              </div>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter className="flex items-center justify-end gap-2 w-full">
        <Button variant="flat" color="default" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {!decodedBundle && activeTab === 'code' && (
          <Button
            color="primary"
            variant="solid"
            size="sm"
            onClick={() => handleCodeSubmit()}
          >
            Load Links
          </Button>
        )}
        {decodedBundle && (
          <Button
            color="primary"
            variant="solid"
            size="sm"
            onClick={handleConfirmImport}
            disabled={selectedLinkIndices.length === 0}
          >
            {isAuthenticated
              ? `Save ${selectedLinkIndices.length} Link${selectedLinkIndices.length === 1 ? '' : 's'}`
              : `Login & Save ${selectedLinkIndices.length} Link${selectedLinkIndices.length === 1 ? '' : 's'}`}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
