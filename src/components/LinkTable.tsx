import React from 'react';
import {
  Star,
  ExternalLink,
  Copy,
  QrCode,
  SquarePen,
  Trash2,
  Globe,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { LinkItem, Category, SortOption } from '../types.ts';
import { extractDomain } from '../utils/vaultLogic.ts';
import { CategoryIcon } from './CategoryIcon.tsx';

interface LinkTableProps {
  links: LinkItem[];
  categories: Category[];
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  onOpen: (link: LinkItem) => void;
  onToggleFavorite: (id: string) => void;
  onShareQr: (link: LinkItem) => void;
  onEdit: (link: LinkItem) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
  onCopyUrl: (url: string) => void;
}

export const LinkTable: React.FC<LinkTableProps> = ({
  links,
  categories,
  sortOption,
  onSortChange,
  onOpen,
  onToggleFavorite,
  onShareQr,
  onEdit,
  onDelete,
  onTagClick,
  onCopyUrl,
}) => {
  const getCategory = (slug: string) => categories.find((c) => c.slug === slug);

  const renderSortIndicator = (current: SortOption, asc: SortOption, desc: SortOption) => {
    if (current === asc) return <ArrowUp size={11} className="inline ml-1 text-[#ff9000]" />;
    if (current === desc) return <ArrowDown size={11} className="inline ml-1 text-[#ff9000]" />;
    return <ArrowUpDown size={11} className="inline ml-1 opacity-40" />;
  };

  return (
    <div className="w-full bg-[#161616] border border-[#262626] rounded-xl shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#111111] border-b border-[#262626] text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
              <th className="p-3 w-10 text-center">
                <Star size={12} className="inline opacity-60" />
              </th>
              <th
                onClick={() => onSortChange(sortOption === 'alpha' ? 'alpha-desc' : 'alpha')}
                className="p-3 cursor-pointer hover:text-white transition-colors"
              >
                Title {renderSortIndicator(sortOption, 'alpha', 'alpha-desc')}
              </th>
              <th className="p-3">Domain</th>
              <th className="p-3">Category</th>
              <th className="p-3">Tags</th>
              <th
                onClick={() => onSortChange('visits')}
                className="p-3 cursor-pointer hover:text-white transition-colors text-center w-20"
              >
                Visits {sortOption === 'visits' ? <ArrowDown size={11} className="inline text-[#ff9000]" /> : ''}
              </th>
              <th
                onClick={() => onSortChange(sortOption === 'recent' ? 'oldest' : 'recent')}
                className="p-3 cursor-pointer hover:text-white transition-colors text-center w-28"
              >
                Date {renderSortIndicator(sortOption, 'oldest', 'recent')}
              </th>
              <th className="p-3 text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#242424]">
            {links.map((link) => {
              const cat = getCategory(link.categorySlug);
              const domain = extractDomain(link.url);

              return (
                <tr
                  key={link.id}
                  className="hover:bg-[#1d1d1d] transition-colors group text-zinc-300"
                >
                  {/* Star Favorite */}
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(link.id)}
                      className="p-1 rounded hover:bg-[#252525] transition-colors"
                      aria-label={link.isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      <Star
                        size={13}
                        className={link.isFavorite ? 'text-[#ff9000] fill-[#ff9000]' : 'text-zinc-600 group-hover:text-zinc-400'}
                      />
                    </button>
                  </td>

                  {/* Title & Favicon */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Globe size={13} className="text-zinc-500 shrink-0" />
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          onOpen(link);
                        }}
                        className="font-title font-bold text-white hover:text-[#ff9000] transition-colors line-clamp-1 max-w-xs sm:max-w-md text-xs tracking-tight"
                      >
                        {link.title}
                      </a>
                    </div>
                  </td>

                  {/* Domain */}
                  <td className="p-3 font-mono text-[11px] text-zinc-400 truncate max-w-[140px]">
                    {domain}
                  </td>

                  {/* Category */}
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#222222] text-zinc-300 border border-[#2e2e2e]">
                      <CategoryIcon name={cat?.icon || link.categorySlug} size={11} className="text-[#ff9000]" />
                      <span>{cat?.name || 'General'}</span>
                    </span>
                  </td>

                  {/* Tags */}
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {link.tags && link.tags.length > 0 ? (
                        link.tags.slice(0, 2).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => onTagClick(tag)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#202020] text-zinc-400 hover:text-[#ff9000] border border-[#2b2b2b]"
                          >
                            #{tag}
                          </button>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-600">—</span>
                      )}
                    </div>
                  </td>

                  {/* Visits */}
                  <td className="p-3 text-center font-mono text-zinc-400">
                    {link.clickCount || 0}
                  </td>

                  {/* Date */}
                  <td className="p-3 text-center text-[11px] text-zinc-500 font-mono">
                    {new Date(link.createdAt).toLocaleDateString()}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpen(link)}
                        className="p-1.5 rounded hover:bg-[#252525] text-zinc-400 hover:text-white transition-colors"
                        title="Open in new tab"
                        aria-label="Open link"
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onCopyUrl(link.url)}
                        className="p-1.5 rounded hover:bg-[#252525] text-zinc-400 hover:text-white transition-colors"
                        title="Copy URL"
                        aria-label="Copy URL"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onShareQr(link)}
                        className="p-1.5 rounded hover:bg-[#252525] text-zinc-400 hover:text-white transition-colors"
                        title="Share via QR Code"
                        aria-label="Share QR"
                      >
                        <QrCode size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(link)}
                        className="p-1.5 rounded hover:bg-[#252525] text-zinc-400 hover:text-[#ff9000] transition-colors cursor-pointer"
                        title="Edit bookmark"
                        aria-label="Edit bookmark"
                      >
                        <SquarePen size={13} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(link.id)}
                        className="p-1.5 rounded hover:bg-red-950/40 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Delete bookmark"
                        aria-label="Delete bookmark"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
