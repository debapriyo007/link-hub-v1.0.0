import React, { useState, useEffect } from 'react';
import { Trash2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Category } from '../../types.ts';
import { formatCategoryName } from '../../utils/vaultLogic.ts';
import { playRetroClick, playRetroBeep } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { CategoryIcon } from '../CategoryIcon.tsx';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (categoryData: Partial<Category>) => void;
  onDelete?: (category: Category) => void;
  category?: Category | null;
}

const PRESET_COLORS = [
  '#ff9000', // LINKHUB Signature Orange
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#ef4444', // Red
  '#f59e0b', // Amber
];

const PRESET_ICONS = [
  'clapperboard',
  'graduation-cap',
  'compass',
  'briefcase',
  'bookmark',
  'code',
  'target',
  'check-square',
  'calendar',
  'clock',
  'zap',
  'trending-up',
  'lightbulb',
  'wallet',
  'bot',
  '18+',
  'gaming',
  'headphones',
  'terminal',
  'sparkles',
  'rocket',
  'palette',
  'tech',
  'database',
  'globe',
  'shield',
  'flame',
  'layers',
  'shopping',
  'heart',
];

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  category,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff9000');
  const [icon, setIcon] = useState('compass');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (category) {
      setName(formatCategoryName(category.name || ''));
      setColor(category.color || '#ff9000');
      setIcon(category.icon || 'compass');
      setDescription(category.description || '');
      setIsPrivate(Boolean(category.isPrivate));
      setPrivatePin('');
    } else {
      setName('');
      setColor('#ff9000');
      setIcon('compass');
      setDescription('');
      setIsPrivate(false);
      setPrivatePin('');
    }
    setShowPin(false);
    setError('');
    setPinError('');
  }, [category, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawTrimmed = name.trim();
    if (!rawTrimmed) {
      setError('Please provide a category name.');
      playRetroBeep();
      return;
    }
    const cleanName = formatCategoryName(rawTrimmed);

    const cleanPin = privatePin.replace(/\D/g, '');
    const hasExistingPin = Boolean(
      category?.isPrivate && (category?.privateVaultMeta || category?.privatePinHash)
    );

    if (isPrivate) {
      if (!hasExistingPin && cleanPin.length !== 6) {
        setPinError('Enter a 6-digit numeric security code for this private category.');
        playRetroBeep();
        return;
      }
      if (cleanPin.length > 0 && cleanPin.length !== 6) {
        setPinError('Security code must be exactly 6 digits.');
        playRetroBeep();
        return;
      }
    }

    const slug = category
      ? category.slug
      : cleanName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;

    playRetroClick();
    onSave({
      name: cleanName,
      slug,
      color,
      icon,
      description: description.trim(),
      isPrivate,
      privatePin: isPrivate && cleanPin.length === 6 ? cleanPin : undefined,
      privateVaultMeta: isPrivate ? category?.privateVaultMeta : '',
      privatePinHash: isPrivate ? category?.privatePinHash : '',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose}>
        <span className="font-title font-bold text-white tracking-tight text-sm">
          {category ? 'Edit Category' : 'New Category'}
        </span>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <ModalBody className="space-y-3.5">
          <Input
            label="Category Name"
            placeholder="e.g. Gaming, Productivity, Secret Docs"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            errorMessage={error}
            autoFocus
            required
          />

          {/* Private Encrypted Category Toggle & 6-Digit Security Code */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Private Encrypted Category</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Encrypted in database • Hidden from All Links
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                aria-label="Private Encrypted Category"
                onClick={() => {
                  playRetroClick();
                  setIsPrivate(!isPrivate);
                  setPinError('');
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                  isPrivate
                    ? 'bg-[#ff9000] shadow-[0_0_12px_rgba(255,144,0,0.35)]'
                    : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-transform ${
                    isPrivate ? 'translate-x-5 bg-black' : 'translate-x-0 bg-zinc-300'
                  }`}
                />
              </button>
            </div>

            {isPrivate && (
              <div className="pt-2.5 border-t border-white/[0.07] space-y-1.5 animate-in fade-in duration-150">
                <label className="block text-[11px] font-semibold text-zinc-300">
                  {category?.isPrivate && category?.privatePinHash
                    ? 'Update 6-Digit Private Security Code (leave blank to keep current)'
                    : 'Set 6-Digit Private Security Code'}
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={privatePin}
                    onChange={(e) => {
                      setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setPinError('');
                    }}
                    placeholder="Enter 6-digit security code (e.g. 258012)"
                    aria-label="Private Category Security Code"
                    className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-[#16161d] border border-white/[0.1] focus:border-[#ff9000] text-xs text-white font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-500 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    aria-label={showPin ? 'Hide security code' : 'Show security code'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {pinError ? (
                  <p className="text-[11px] text-red-400 font-medium">{pinError}</p>
                ) : (
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <ShieldCheck size={11} className="text-[#ff9000] shrink-0" />
                    <span>
                      Requires this code on a lock screen before viewing or opening its links.
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Curated 30 Category Icons (Productive, 18+, Tech & Media) */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-semibold text-zinc-300">
              Category Icon
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setIcon(ic);
                  }}
                  className={`h-9 rounded-xl flex items-center justify-center transition-all border cursor-pointer ${
                    icon === ic
                      ? 'border-[#ff9000] bg-[#ff9000]/15 text-[#ff9000] shadow-[0_0_12px_rgba(255,144,0,0.2)] scale-105'
                      : 'border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.07]'
                  }`}
                  aria-label={ic}
                >
                  <CategoryIcon name={ic} size={15} />
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-semibold text-zinc-300">
              Accent Color
            </label>
            <div className="flex items-center gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setColor(c);
                  }}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-[#141414] ring-[#ff9000] scale-110'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs font-semibold text-zinc-300">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description..."
              className="w-full text-xs rounded-xl p-2.5 bg-white/[0.03] border border-white/[0.09] focus:border-[#ff9000] outline-none text-zinc-200 placeholder:text-zinc-500 resize-none"
            />
          </div>
        </ModalBody>

        <ModalFooter className="flex items-center justify-between w-full">
          {category && onDelete ? (
            <button
              type="button"
              onClick={() => {
                playRetroClick();
                onDelete(category);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="flat" color="default" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="primary" variant="solid" size="sm">
              {category ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
};
