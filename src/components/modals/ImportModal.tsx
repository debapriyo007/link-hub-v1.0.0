import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { LinkItem, Category } from '../../types.ts';
import { parseHtmlBookmarks, extractDomain, getFaviconUrl } from '../../utils/vaultLogic.ts';
import { playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (links: LinkItem[], categories?: Category[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [importCount, setImportCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const processText = (text: string) => {
    if (!text.trim()) {
      setImportCount(null);
      setError('');
      return null;
    }
    try {
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const parsed = JSON.parse(text);
        const rawLinks: unknown[] = Array.isArray(parsed)
          ? parsed
          : (parsed as { links?: unknown[] }).links || [];
        const links: LinkItem[] = (rawLinks as Array<Record<string, unknown>>)
          .map((item, idx) => ({
            id: (item.id as string) || `imported-${Date.now()}-${idx}`,
            title:
              (item.title as string) ||
              extractDomain((item.url as string) || '') ||
              'Untitled Link',
            url: (item.url as string) || '',
            categorySlug: (item.categorySlug as string) || 'study',
            description: (item.description as string) || '',
            tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
            isFavorite: Boolean(item.isFavorite),
            clickCount: Number(item.clickCount) || 0,
            imageUrl: (item.imageUrl as string) || '',
            faviconUrl:
              (item.faviconUrl as string) || getFaviconUrl((item.url as string) || ''),
            createdAt: Number(item.createdAt) || Date.now(),
            updatedAt: Number(item.updatedAt) || Date.now(),
          }))
          .filter((l) => l.url.startsWith('http'));

        const rawCategories: Category[] | undefined = (parsed as { categories?: Category[] })
          .categories;
        setImportCount(links.length);
        setError('');
        return { links, categories: rawCategories };
      } else {
        const partials = parseHtmlBookmarks(text);
        const links: LinkItem[] = partials
          .map((p, idx) => ({
            id: `imported-html-${Date.now()}-${idx}`,
            title: p.title || 'Imported Link',
            url: p.url || '',
            categorySlug: p.categorySlug || 'study',
            description: p.description || '',
            tags: p.tags || [],
            isFavorite: Boolean(p.isFavorite),
            clickCount: 0,
            imageUrl: '',
            faviconUrl: getFaviconUrl(p.url || ''),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }))
          .filter((l) => l.url.startsWith('http'));

        setImportCount(links.length);
        setError('');
        return { links };
      }
    } catch {
      setError('Invalid file format. Please use a valid HTML or JSON export.');
      playRetroBeep();
      return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      processText(text);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    const result = processText(content);
    if (result && result.links.length > 0) {
      playRetroUnlockChime();
      onImportComplete(result.links, result.categories);
      onClose();
    } else {
      setError('No valid bookmarks found to import.');
      playRetroBeep();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>
        <span className="font-title font-bold text-white tracking-tight text-sm">
          Import Bookmarks
        </span>
      </ModalHeader>

      <ModalBody className="space-y-3.5">
        {/* Clean Minimal File Upload Box (No Decorative Icons) */}
        <label className="border border-dashed border-white/[0.14] hover:border-[#ff9000]/60 rounded-xl py-4 px-4 flex flex-col items-center justify-center text-center cursor-pointer bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <span className="text-xs font-title font-semibold text-white">
            Choose HTML or JSON Backup File
          </span>
          <span className="text-[11px] text-zinc-400 mt-0.5">
            Supports Chrome, Firefox, Safari & LINKHUB exports
          </span>
          <input
            type="file"
            accept=".html,.htm,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {/* Clean Paste Input with Short Understandable Placeholder */}
        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-zinc-300">
            Or Paste Bookmark Data
          </label>
          <textarea
            rows={2}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              processText(e.target.value);
            }}
            placeholder="Paste exported JSON or HTML bookmarks..."
            className="w-full text-xs rounded-xl p-2.5 bg-white/[0.03] border border-white/[0.09] focus:border-[#ff9000] outline-none text-zinc-200 placeholder:text-zinc-500 resize-none"
          />
        </div>

        {importCount !== null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#ff9000]/10 border border-[#ff9000]/30 text-[#ff9000] text-xs font-medium">
            <Check size={13} />
            <span>
              {importCount} bookmark{importCount === 1 ? '' : 's'} ready to import
            </span>
          </div>
        )}

        {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
      </ModalBody>

      <ModalFooter>
        <Button size="sm" variant="flat" color="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          color="primary"
          variant="solid"
          onClick={handleConfirmImport}
          disabled={!content.trim() || importCount === 0}
        >
          {importCount ? `Import (${importCount})` : 'Import'}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
