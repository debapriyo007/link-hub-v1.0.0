import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  ExternalLink,
  Copy,
  Globe,
  Star,
  Folder,
  X,
} from 'lucide-react';
import { LinkItem, Category } from '../../types.ts';
import { extractDomain } from '../../utils/vaultLogic.ts';
import { playRetroClick } from '../../utils/sound.ts';
import { CategoryIcon } from '../CategoryIcon.tsx';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: LinkItem[];
  categories: Category[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenLink: (link: LinkItem) => void;
  onCopyUrl: (url: string) => void;
  onSelectCategory: (slug: string) => void;
}

type CommandSearchItem =
  | { type: 'link'; id: string; link: LinkItem; category?: Category }
  | { type: 'category'; id: string; category: Category };

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  links,
  categories,
  searchQuery,
  onSearchChange,
  onOpenLink,
  onCopyUrl,
  onSelectCategory,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [isOpen]);

  const query = searchQuery.trim().toLowerCase();

  const matchedLinks = useMemo(() => {
    if (!query) {
      return [...links]
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.createdAt - a.createdAt)
        .slice(0, 6);
    }
    return links
      .filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          l.url.toLowerCase().includes(query) ||
          (l.description || '').toLowerCase().includes(query) ||
          (l.tags || []).some((t) => t.toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [links, query]);

  const matchedCategories = useMemo(() => {
    if (!query) return categories.slice(0, 6);
    return categories.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 6);
  }, [categories, query]);

  const flatItems: CommandSearchItem[] = useMemo(() => {
    const items: CommandSearchItem[] = [];
    matchedLinks.forEach((link) => {
      const cat = categories.find((c) => c.slug === link.categorySlug);
      items.push({ type: 'link', id: `link-${link.id}`, link, category: cat });
    });
    matchedCategories.forEach((category) => {
      items.push({ type: 'category', id: `cat-${category.id}`, category });
    });
    return items;
  }, [matchedLinks, matchedCategories, categories]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatItems.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % flatItems.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatItems.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
        }
      } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        playRetroClick();
        if (item.type === 'link') {
          onClose();
          onOpenLink(item.link);
        } else if (item.type === 'category') {
          onSelectCategory(item.category.slug);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatItems, selectedIndex, onClose, onOpenLink, onSelectCategory]);

  if (!isOpen) return null;

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Command Search"
        className="w-full max-w-[560px] rounded-2xl bg-[#111216]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_28px_80px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.09)] overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Top Spotlight Search Bar */}
        <div className="flex items-center gap-3 px-4 sm:px-5 h-13 border-b border-white/[0.07] bg-white/[0.015]">
          <Search size={17} className="text-[#ff9000] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search bookmarks, domains, #tags, or categories..."
            className="w-full bg-transparent text-sm text-white font-title placeholder:font-sans placeholder:text-zinc-500 outline-none caret-[#ff9000]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
              aria-label="Clear search query"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.09] text-[10px] font-mono font-semibold text-zinc-400 hover:text-white shrink-0 cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Suggestions & Results List (Bookmarks & Categories Only — No Bottom Bar) */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3.5">
          {flatItems.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-title font-semibold text-white">
                No matching bookmarks or categories
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Try searching for another keyword, domain, or tag
              </p>
            </div>
          ) : (
            <>
              {/* 1. Bookmarks Section */}
              {matchedLinks.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[10px] font-title font-bold uppercase tracking-widest text-zinc-500 flex items-center justify-between">
                    <span>{query ? 'Matching Bookmarks' : 'Suggested Bookmarks'}</span>
                    <span>{matchedLinks.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {matchedLinks.map((link) => {
                      runningIdx += 1;
                      const itemIndex = runningIdx;
                      const isSelected = selectedIndex === itemIndex;
                      const domain = extractDomain(link.url);
                      const cat = categories.find((c) => c.slug === link.categorySlug);

                      return (
                        <div
                          key={link.id}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          onClick={() => {
                            playRetroClick();
                            onClose();
                            onOpenLink(link);
                          }}
                          className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-white/[0.08] text-white'
                              : 'text-zinc-300 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                              {link.faviconUrl ? (
                                <img
                                  src={link.faviconUrl}
                                  alt=""
                                  className="w-4 h-4 object-contain"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Globe size={14} className="text-[#ff9000]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-title font-semibold text-xs text-white truncate">
                                  {link.title}
                                </span>
                                {link.isFavorite && (
                                  <Star size={11} className="text-[#ff9000] fill-[#ff9000] shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                                <span className="font-mono truncate max-w-[180px]">{domain}</span>
                                {cat && (
                                  <>
                                    <span className="text-zinc-600">•</span>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                                      {cat.name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right Actions: Copy URL & Open */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playRetroClick();
                                onCopyUrl(link.url);
                              }}
                              title="Copy URL"
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white border border-white/[0.07] transition-colors cursor-pointer"
                            >
                              <Copy size={13} />
                            </button>
                            <span
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSelected ? 'text-[#ff9000]' : 'text-zinc-500'
                              }`}
                            >
                              <ExternalLink size={13} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Categories Section */}
              {matchedCategories.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[10px] font-title font-bold uppercase tracking-widest text-zinc-500">
                    Categories
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {matchedCategories.map((cat) => {
                      runningIdx += 1;
                      const itemIndex = runningIdx;
                      const isSelected = selectedIndex === itemIndex;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          onClick={() => {
                            playRetroClick();
                            onSelectCategory(cat.slug);
                            onClose();
                          }}
                          className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-white/[0.08] text-white'
                              : 'text-zinc-300 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-[#ff9000] shrink-0">
                              <CategoryIcon name={cat.icon || cat.slug} size={13} />
                            </div>
                            <span className="text-xs font-medium truncate">{cat.name}</span>
                          </div>
                          <Folder size={12} className="text-zinc-500 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
