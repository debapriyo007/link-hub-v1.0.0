import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { LinkItem, Category } from '../../types.ts';
import { exportLinksToJson, exportLinksToHtmlBookmarks } from '../../utils/vaultLogic.ts';
import { playRetroClick, playRetroUnlockChime } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: LinkItem[];
  categories: Category[];
  onShowToast: (msg: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  links,
  categories,
  onShowToast,
}) => {
  const [format, setFormat] = useState<'json' | 'html' | 'text'>('json');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    playRetroUnlockChime();
    const today = new Date().toISOString().split('T')[0];

    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      content = exportLinksToJson(links, categories);
      filename = `LINKHUB_Vault_Backup_${today}.json`;
      mimeType = 'application/json';
    } else if (format === 'html') {
      content = exportLinksToHtmlBookmarks(links);
      filename = `LINKHUB_Bookmarks_${today}.html`;
      mimeType = 'text/html';
    } else {
      content = links.map((l) => `${l.title} - ${l.url} (${l.categorySlug})`).join('\n');
      filename = `LINKHUB_Links_${today}.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    onShowToast(`Exported ${links.length} links!`);
    onClose();
  };

  const handleCopyClipboard = () => {
    playRetroClick();
    let content = '';
    if (format === 'json') {
      content = exportLinksToJson(links, categories);
    } else if (format === 'html') {
      content = exportLinksToHtmlBookmarks(links);
    } else {
      content = links.map((l) => `${l.title} - ${l.url}`).join('\n');
    }
    navigator.clipboard.writeText(content);
    setCopied(true);
    onShowToast('Export data copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>
        <span className="font-title font-bold text-white tracking-tight text-sm">
          Export Bookmarks
        </span>
      </ModalHeader>

      <ModalBody className="space-y-3">
        <label className="block text-xs font-semibold text-zinc-300">
          Select Export Format ({links.length} bookmarks)
        </label>

        <div className="space-y-2">
          {[
            {
              id: 'json' as const,
              title: 'JSON Backup',
              desc: 'Complete vault backup with categories and tags',
            },
            {
              id: 'html' as const,
              title: 'Browser HTML',
              desc: 'Compatible with Chrome, Firefox, Safari & Edge',
            },
            {
              id: 'text' as const,
              title: 'Plain Text',
              desc: 'Clean list of titles and URLs',
            },
          ].map((item) => {
            const isSelected = format === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'border-[#ff9000] bg-[#ff9000]/12'
                    : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05]'
                }`}
              >
                <div>
                  <div
                    className={`text-xs font-title font-bold ${
                      isSelected ? 'text-[#ff9000]' : 'text-white'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-[#ff9000] bg-[#ff9000]' : 'border-white/20'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                </div>
              </button>
            );
          })}
        </div>
      </ModalBody>

      <ModalFooter className="flex justify-between items-center w-full">
        <Button
          size="sm"
          variant="light"
          onClick={handleCopyClipboard}
          startContent={copied ? <Check size={12} /> : <Copy size={12} />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" color="default" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" color="primary" variant="solid" onClick={handleDownload}>
            Download
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
