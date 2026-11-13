import React, { useState, useRef, useEffect } from 'react';
import {
  Star,
  MoreVertical,
  Copy,
  ExternalLink,
  Globe,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { LinkItem, Category } from '../types.ts';
import { extractDomain } from '../utils/vaultLogic.ts';
import { Card, CardBody, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { IncognitoIcon } from './ui/IncognitoIcon.tsx';

interface LinkCardProps {
  link: LinkItem;
  category?: Category;
  onOpen: (link: LinkItem) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (link: LinkItem) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
  onCopyUrl: (url: string) => void;
  onShowIncognito: (link: LinkItem) => void;
}

export const LinkCard: React.FC<LinkCardProps> = React.memo(
  ({
    link,
    category,
    onOpen,
    onToggleFavorite,
    onEdit,
    onDelete,
    onTagClick,
    onCopyUrl,
    onShowIncognito,
  }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [imgError, setImgError] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const domain = extractDomain(link.url);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setMenuOpen(false);
        }
      };
      if (menuOpen) {
        window.addEventListener('mousedown', handleClickOutside);
      }
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    const formatTimeAgo = (timestamp: number) => {
      const diffHours = (Date.now() - timestamp) / (1000 * 60 * 60);
      if (diffHours < 24) return 'Today';
      const days = Math.floor(diffHours / 24);
      if (days === 1) return 'Yesterday';
      return `${days}d ago`;
    };

    return (
      <Card className="group relative flex flex-col justify-between overflow-hidden glass-card hover:border-[#ff9000]/50 hover:shadow-2xl hover:shadow-black/70 rounded-2xl transition-colors duration-150">
        {/* Sleek Professional Glass Header */}
        <div className="relative w-full p-3.5 sm:p-4 pb-3 bg-white/[0.02] border-b border-white/[0.07]">
          <div className="flex items-start justify-between gap-2.5 sm:gap-3">
            {/* Favicon & Domain Badge */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg glass-input flex items-center justify-center p-1.5 shrink-0 group-hover:border-[#ff9000]/40 transition-colors">
                {link.faviconUrl && !imgError ? (
                  <img
                    src={link.faviconUrl}
                    alt={domain}
                    onError={() => setImgError(true)}
                    className="w-5 h-5 object-contain rounded-[4px] bg-white/90 p-0.5"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Globe size={18} className="text-[#ff9000]" />
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-mono font-semibold text-zinc-200 truncate tracking-tight">
                  {domain}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: category?.color || '#ff9000' }}
                  />
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                    {category?.name || 'General'}
                  </span>
                </div>
              </div>
            </div>

          {/* Quick Floating Action Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Star Favorite */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(link.id);
              }}
              className="w-7 h-7 rounded-md glass-input text-zinc-300 hover:text-[#ff9000] flex items-center justify-center transition-colors cursor-pointer"
              title={link.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={link.isFavorite ? 'Favorited' : 'Add to favorites'}
            >
              <Star
                size={13}
                className={link.isFavorite ? 'text-[#ff9000] fill-[#ff9000]' : 'text-zinc-400'}
              />
            </button>

            {/* Quick Edit Button (matching category edit icon button) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(link);
              }}
              className="w-7 h-7 rounded-md glass-input text-zinc-400 hover:text-[#ff9000] flex items-center justify-center transition-colors cursor-pointer"
              title="Edit bookmark"
              aria-label="Edit bookmark"
            >
              <SquarePen size={12} strokeWidth={2.2} />
            </button>

            {/* More Menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="w-7 h-7 rounded-md glass-input text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="More options"
                aria-label="More options"
              >
                <MoreVertical size={13} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-8 w-36 glass-panel rounded-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(link);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.08] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <SquarePen size={12} strokeWidth={2.2} className="text-[#ff9000]" />
                    <span>Edit Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onCopyUrl(link.url);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.08] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>Copy URL</span>
                  </button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      onShowIncognito(link);
                    }}
                    title="Right-click or long-press → Open in Private / Incognito tab"
                    className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.08] hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <IncognitoIcon size={13} className="text-[#ff9000]" />
                    <span>Private Launch</span>
                  </a>
                  <div className="my-1 border-t border-white/[0.08]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(link.id);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card Content Body */}
      <CardBody className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Title */}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              onOpen(link);
            }}
            className="font-title font-bold text-[15px] text-white hover:text-[#ff9000] line-clamp-1 transition-colors tracking-tight block"
            title={link.title}
          >
            {link.title}
          </a>

          {/* Description */}
          {link.description && (
            <p className="text-xs text-zinc-400 line-clamp-2 mt-1.5 leading-relaxed">
              {link.description}
            </p>
          )}
        </div>

        {/* Tags row */}
        {link.tags && link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {link.tags.slice(0, 3).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className="text-[10px] font-mono font-medium px-2 py-0.5 rounded glass-input hover:bg-white/[0.08] text-zinc-300 hover:text-[#ff9000] transition-colors cursor-pointer"
              >
                #{tag}
              </button>
            ))}
            {link.tags.length > 3 && (
              <span className="text-[10px] text-zinc-500 self-center">
                +{link.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardBody>

      {/* Card Footer Bar */}
      <CardFooter className="px-4 py-2.5 bg-black/25 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-zinc-400 font-medium">
        <div className="flex items-center gap-2 font-mono">
          <span>{formatTimeAgo(link.createdAt)}</span>
          <span
            aria-hidden="true"
            className="w-1 h-1 rounded-full bg-zinc-500/80 shrink-0"
          />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowIncognito(link);
            }}
            title="Right-click or long-press → Open in Private / Incognito tab"
            aria-label={`Private launch ${link.title}`}
            className="p-1 -m-1 rounded-md text-zinc-400 hover:text-[#ff9000] hover:bg-white/[0.06] transition-colors cursor-pointer inline-flex items-center justify-center"
          >
            <IncognitoIcon size={14} />
          </a>
        </div>

        <div className="flex items-center">
          <Button
            size="sm"
            color="primary"
            variant="solid"
            onClick={() => onOpen(link)}
            className="h-7 px-3 text-[11px] font-bold rounded uppercase tracking-wider"
            endContent={<ExternalLink size={11} className="stroke-[2.5]" />}
          >
            OPEN
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
  }
);
