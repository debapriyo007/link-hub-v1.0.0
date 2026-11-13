import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Bookmark,
  Star,
  Image as ImageIcon,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { LinkItem, Category } from '../../types.ts';
import { normalizeUrl, extractDomain, formatCategoryName } from '../../utils/vaultLogic.ts';
import { playRetroClick, playRetroBeep, playRetroUnlockChime } from '../../utils/sound.ts';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Chip } from '../ui/Chip.tsx';
import { CategoryIcon } from '../CategoryIcon.tsx';

interface AddLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (linkData: Partial<LinkItem>) => void;
  initialLink?: LinkItem | null;
  categories: Category[];
  activeCategorySlug: string;
}

export const AddLinkModal: React.FC<AddLinkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialLink,
  categories,
  activeCategorySlug,
}) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [categorySlug, setCategorySlug] = useState('study');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [error, setError] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  useEffect(() => {
    if (initialLink) {
      setUrl(initialLink.url || '');
      setTitle(initialLink.title || '');
      setCategorySlug(initialLink.categorySlug || 'study');
      setDescription(initialLink.description || '');
      setTags(initialLink.tags || []);
      setIsFavorite(initialLink.isFavorite || false);
      setImageUrl(initialLink.imageUrl || '');
      setShowImageInput(Boolean(initialLink.imageUrl));
    } else {
      setUrl('');
      setTitle('');
      setCategorySlug(
        activeCategorySlug !== 'all' && activeCategorySlug !== 'starred'
          ? activeCategorySlug
          : categories[0]?.slug || 'study'
      );
      setDescription('');
      setTags([]);
      setIsFavorite(false);
      setImageUrl('');
      setShowImageInput(false);
    }
    setCurrentTag('');
    setError('');
    setIsAiGenerating(false);
  }, [initialLink, isOpen, activeCategorySlug, categories]);

  if (!isOpen) return null;

  const handleUrlBlur = () => {
    if (url.trim() && !title.trim()) {
      const normalized = normalizeUrl(url);
      const domain = extractDomain(normalized);
      const parts = domain.split('.');
      const cleanName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : domain;
      setTitle(`${cleanName} - Reference Link`);
    }
  };

  const handleAiGenerate = async () => {
    const cleanUrl = normalizeUrl(url);
    if (!cleanUrl) {
      setError('Paste a valid URL first to generate with AI.');
      playRetroBeep();
      return;
    }

    setError('');
    playRetroClick();
    setIsAiGenerating(true);

    try {
      const response = await fetch('/api/ai/link-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.title) setTitle(String(data.title));
        if (data.description) setDescription(String(data.description));
        if (Array.isArray(data.tags) && data.tags.length > 0) {
          setTags((prev) =>
            Array.from(
              new Set([
                ...prev,
                ...data.tags.map((t: string) => String(t).toLowerCase().replace(/^#/, '').trim()),
              ])
            ).filter(Boolean)
          );
        }
        if (
          data.suggestedCategorySlug &&
          categories.some((c) => c.slug === data.suggestedCategorySlug)
        ) {
          setCategorySlug(data.suggestedCategorySlug);
        }
        playRetroUnlockChime();
        return;
      }
    } catch {
      // Fallback below if offline or route unreachable
    } finally {
      setIsAiGenerating(false);
    }

    // Client-side fallback synthesis
    const domain = extractDomain(cleanUrl);
    const brand = domain.split('.')[0] || 'Resource';
    const brandTitle = brand.charAt(0).toUpperCase() + brand.slice(1);
    setTitle(`${brandTitle} — Official Resource & Reference`);
    setDescription(
      `Curated bookmark and reference resource from ${domain} saved to your personal LINKHUB cloud vault.`
    );
    setTags((prev) => Array.from(new Set([...prev, brand.toLowerCase(), 'resource'])));
    playRetroUnlockChime();
  };

  const handleAddTag = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = currentTag.trim().toLowerCase().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setCurrentTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = normalizeUrl(url);
    if (!cleanUrl) {
      setError('Please provide a valid URL.');
      playRetroBeep();
      return;
    }

    const cleanTitle = title.trim() || extractDomain(cleanUrl) || cleanUrl;
    const pendingTag = currentTag.trim().toLowerCase().replace(/^#/, '');
    const finalTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    playRetroClick();
    onSave({
      url: cleanUrl,
      title: cleanTitle,
      categorySlug: categorySlug || categories[0]?.slug || 'study',
      description: description.trim(),
      tags: finalTags,
      isFavorite,
      imageUrl: imageUrl.trim() || '',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader onClose={onClose}>
        <span className="font-title font-bold text-white tracking-tight text-sm">
          {initialLink ? 'Edit Bookmark' : 'Add Bookmark'}
        </span>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <ModalBody className="space-y-4">
          {/* Row 1: Destination URL (with AI Auto-Fill Button inside input) & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Destination URL"
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              onBlur={handleUrlBlur}
              required
              autoFocus
              errorMessage={error}
              startContent={<LinkIcon size={14} className="text-[#ff9000]" />}
              isClearable
              onClear={() => setUrl('')}
              endContent={
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={isAiGenerating}
                  title="Generate Title, Description & Tags with AI"
                  aria-label="Generate Title and Description with AI"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                    url.trim()
                      ? 'bg-[#ff9000] hover:bg-[#ffa31a] text-black shadow-xs shadow-[#ff9000]/25'
                      : 'bg-[#ff9000]/15 hover:bg-[#ff9000]/25 text-[#ff9000] border border-[#ff9000]/35'
                  }`}
                >
                  {isAiGenerating ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} strokeWidth={2.4} />
                  )}
                  <span>{isAiGenerating ? 'AI...' : 'AI'}</span>
                </button>
              }
            />

            <Input
              label="Title / Name"
              type="text"
              placeholder="Enter bookmark title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              startContent={<Bookmark size={14} className="text-zinc-400" />}
            />
          </div>

          {/* Row 2: Category selection grid (Wider so all category names are fully visible) */}
          <div className="flex flex-col gap-1.5 text-left">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-zinc-300">Category</label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {categories.map((cat) => {
                const isSelected = categorySlug === cat.slug;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategorySlug(cat.slug)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#ff9000] bg-[#ff9000]/15 text-[#ff9000]'
                        : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <CategoryIcon
                      name={cat.icon || cat.slug}
                      size={13}
                      className={`shrink-0 ${isSelected ? 'text-[#ff9000]' : 'text-zinc-400'}`}
                    />
                    <span className="truncate">{formatCategoryName(cat.name)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Description & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-semibold text-zinc-300">
                Description (Optional)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a short note or click AI in the URL box..."
                className="w-full rounded-xl p-2.5 bg-white/[0.03] border border-white/[0.09] focus:border-[#ff9000] focus:ring-2 focus:ring-[#ff9000]/20 text-xs text-white placeholder:text-zinc-500 outline-none transition-all resize-none h-[78px]"
              />
            </div>

            <div className="flex flex-col gap-1.5 text-left justify-between">
              <label className="text-xs font-semibold text-zinc-300">Tags</label>
              <div className="flex flex-wrap gap-1.5 min-h-[26px] items-center">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    size="sm"
                    variant="flat"
                    onClose={() => handleRemoveTag(tag)}
                    className="bg-white/[0.05] text-zinc-300 border border-white/[0.09]"
                  >
                    #{tag}
                  </Chip>
                ))}
                {tags.length === 0 && (
                  <span className="text-[11px] text-zinc-500 italic">No tags added yet</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  size="sm"
                  placeholder="Add tag..."
                  value={currentTag}
                  onChange={(e) => setCurrentTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="flat"
                  color="primary"
                  onClick={() => handleAddTag()}
                  disabled={!currentTag.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Options: Favorite & Custom Preview Image */}
          <div className="pt-2 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="w-4 h-4 rounded text-[#ff9000] focus:ring-[#ff9000] accent-[#ff9000]"
              />
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Star size={13} className="text-[#ff9000] fill-[#ff9000]" />
                Mark as Favorite
              </span>
            </label>

            {!showImageInput ? (
              <button
                type="button"
                onClick={() => setShowImageInput(true)}
                className="text-left sm:text-right text-xs text-[#ff9000] hover:underline font-medium cursor-pointer"
              >
                + Add custom preview image URL
              </button>
            ) : (
              <div className="w-full sm:max-w-xs">
                <Input
                  size="sm"
                  placeholder="https://images.unsplash.com/..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  startContent={<ImageIcon size={14} className="text-zinc-500" />}
                  isClearable
                  onClear={() => setImageUrl('')}
                />
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" size="sm" variant="flat" color="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" color="primary" variant="solid">
            {initialLink ? 'Update Bookmark' : 'Save to Vault'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
