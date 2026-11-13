import React, { useState, useRef } from 'react';
import {
  Star,
  SquarePen,
  Trash2,
  FolderOpen,
  FolderPlus,
  GripVertical,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Category } from '../types.ts';
import { formatCategoryName } from '../utils/vaultLogic.ts';
import { playRetroClick } from '../utils/sound.ts';
import { CategoryIcon } from './CategoryIcon.tsx';

interface CategoryPillsProps {
  categories: Category[];
  activeCategory: string;
  onSelectCategory: (slug: string) => void;
  onNewCategory: () => void;
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (cat: Category) => void;
  onReorderCategories: (fromIndex: number, toIndex: number) => void;
  onShareCategoryQr: (cat: Category) => void;
  categoryCounts: Record<string, number>;
  totalLinksCount: number;
  starredCount: number;
  unlockedPrivateSlugs?: Set<string>;
}

export const CategoryPills: React.FC<CategoryPillsProps> = React.memo(
  ({
    categories,
    activeCategory,
    onSelectCategory,
    onNewCategory,
    onEditCategory,
    onDeleteCategory,
    onReorderCategories,
    onShareCategoryQr,
    categoryCounts,
    totalLinksCount,
    starredCount,
    unlockedPrivateSlugs,
  }) => {
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = (direction: 'left' | 'right') => {
      playRetroClick();
      if (!scrollContainerRef.current) return;
      const offset = direction === 'left' ? -240 : 240;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      setDraggedIdx(idx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverIdx !== idx) {
        setDragOverIdx(idx);
      }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
      e.preventDefault();
      const fromIdx =
        draggedIdx !== null ? draggedIdx : parseInt(e.dataTransfer.getData('text/plain'), 10);
      setDraggedIdx(null);
      setDragOverIdx(null);
      if (!Number.isNaN(fromIdx) && fromIdx !== targetIdx) {
        playRetroClick();
        onReorderCategories(fromIdx, targetIdx);
      }
    };

    const handleDragEnd = () => {
      setDraggedIdx(null);
      setDragOverIdx(null);
    };

    return (
      <div className="w-full flex flex-col gap-2">
        {/* Top Row Above Category Bar: Left CATEGORIES (count) + Right < > Scroll Buttons & NEW CATEGORY */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          {/* Left Side Corner: All-Caps CATEGORIES (number) */}
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 select-none truncate">
            CATEGORIES ({categories.length})
          </span>

          {/* Right Side: < > Scroll Buttons + FolderPlus NEW CATEGORY */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Scroll Left Button */}
            <button
              type="button"
              onClick={() => handleScroll('left')}
              aria-label="Scroll categories left"
              title="Scroll left"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft size={14} strokeWidth={2.2} className="sm:w-[15px] sm:h-[15px]" />
            </button>

            {/* Scroll Right Button */}
            <button
              type="button"
              onClick={() => handleScroll('right')}
              aria-label="Scroll categories right"
              title="Scroll right"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight size={14} strokeWidth={2.2} className="sm:w-[15px] sm:h-[15px]" />
            </button>

            {/* New Category Button with FolderPlus Icon (All Caps) */}
            <button
              type="button"
              onClick={onNewCategory}
              className="inline-flex items-center gap-1.5 sm:gap-2 ml-0.5 sm:ml-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#ff9000] hover:text-[#ffa31a] hover:bg-[#ff9000]/10 transition-colors cursor-pointer shrink-0"
            >
              <FolderPlus size={14} strokeWidth={2.2} className="sm:w-4 sm:h-4 shrink-0" />
              <span>NEW CATEGORY</span>
            </button>
          </div>
        </div>

        {/* Category Pills Bar (Responsive Across All Devices) */}
        <div className="glass-card rounded-xl sm:rounded-2xl px-2 sm:px-3.5">
          <div
            ref={scrollContainerRef}
            className="w-full overflow-x-auto no-scrollbar touch-pan-x py-2 sm:py-2.5"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
              {/* All Links Tab */}
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all duration-150 cursor-pointer border ${
                  activeCategory === 'all'
                    ? 'bg-[#ff9000] text-black border-[#ff9000] font-bold shadow-sm shadow-[#ff9000]/25'
                    : 'glass-input text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <FolderOpen
                  size={13}
                  className={activeCategory === 'all' ? 'text-black' : 'text-[#ff9000]'}
                />
                <span>All Links</span>
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    activeCategory === 'all'
                      ? 'bg-black/20 text-black'
                      : 'bg-black/40 text-zinc-400'
                  }`}
                >
                  {totalLinksCount}
                </span>
              </button>

              {/* Starred / Favorites Tab */}
              <button
                type="button"
                onClick={() => onSelectCategory('starred')}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all duration-150 cursor-pointer border ${
                  activeCategory === 'starred'
                    ? 'bg-[#ff9000] text-black border-[#ff9000] font-bold shadow-sm shadow-[#ff9000]/25'
                    : 'glass-input text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                <Star
                  size={13}
                  className={
                    activeCategory === 'starred'
                      ? 'text-black fill-black'
                      : 'text-[#ff9000] fill-[#ff9000]'
                  }
                />
                <span>Favorites</span>
                <span
                  className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    activeCategory === 'starred'
                      ? 'bg-black/20 text-black'
                      : 'bg-black/40 text-zinc-400'
                  }`}
                >
                  {starredCount}
                </span>
              </button>

              {/* Divider */}
              <div className="w-[1px] h-5 bg-white/[0.1] mx-0.5 sm:mx-1" />

              {/* Draggable Category Pills with Hover-Only Barcode/Edit/Delete Icons */}
              {categories.map((cat, idx) => {
                const isActive = activeCategory === cat.slug;
                const count = categoryCounts[cat.slug] || 0;
                const isDragging = draggedIdx === idx;
                const isDragOver = dragOverIdx === idx && draggedIdx !== idx;
                const isPrivate = Boolean(cat.isPrivate);
                const isPrivateUnlocked = isPrivate && Boolean(unlockedPrivateSlugs?.has(cat.slug));
                const displayCatName = formatCategoryName(cat.name);

                return (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    title="Drag left or right to reorder category"
                    className={`group flex items-center rounded-lg transition-all duration-150 border select-none ${
                      isDragging ? 'opacity-45 scale-95 border-[#ff9000]' : ''
                    } ${
                      isDragOver
                        ? 'ring-2 ring-[#ff9000] border-[#ff9000] scale-[1.03] bg-[#ff9000]/15'
                        : isActive
                          ? 'bg-[#ff9000] text-black border-[#ff9000] font-bold shadow-sm shadow-[#ff9000]/20'
                          : 'glass-input text-zinc-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    {/* Drag Grip Handle */}
                    <span
                      className={`pl-2 pr-0.5 cursor-grab active:cursor-grabbing transition-opacity ${
                        isActive
                          ? 'text-black/60 hover:text-black'
                          : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                      title="Drag to reorder"
                    >
                      <GripVertical size={12} />
                    </span>

                    <button
                      type="button"
                      onClick={() => onSelectCategory(cat.slug)}
                      className="flex items-center gap-1.5 pl-1 pr-2.5 group-hover:pr-1.5 py-1.5 text-[11px] sm:text-xs font-medium cursor-pointer"
                    >
                      <CategoryIcon
                        name={cat.icon || cat.slug}
                        size={13}
                        className={isActive ? 'text-black' : 'text-[#ff9000]'}
                      />
                      <span className="truncate max-w-[115px] sm:max-w-[140px] font-medium text-[11px] sm:text-xs">
                        {displayCatName}
                      </span>
                      <span
                        className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center ${
                          isActive
                            ? 'bg-black/20 text-black'
                            : 'bg-black/40 text-zinc-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>

                    {/* Hover-Only Category Actions: Barcode/QR, Edit (SquarePen), Delete */}
                    <div className="hidden group-hover:flex items-center gap-0.5 pr-1.5 animate-in fade-in duration-100">
                      {(!isPrivate || isPrivateUnlocked) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShareCategoryQr(cat);
                          }}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            isActive
                              ? 'text-black/80 hover:bg-black/15 hover:text-black'
                              : 'text-zinc-400 hover:bg-white/[0.08] hover:text-[#ff9000]'
                          }`}
                          title={`Share "${cat.name}" via QR or Code`}
                          aria-label={`Share ${cat.name} QR`}
                        >
                          <QrCode size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCategory(cat);
                        }}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'text-black/80 hover:bg-black/15 hover:text-black'
                            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-white'
                        }`}
                        title={`Edit "${cat.name}"`}
                        aria-label={`Edit ${cat.name}`}
                      >
                        <SquarePen size={12} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCategory(cat);
                        }}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'text-black/80 hover:bg-black/15 hover:text-red-900'
                            : 'text-zinc-400 hover:bg-red-500/15 hover:text-red-400'
                        }`}
                        title={`Delete "${cat.name}"`}
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Drag Hint */}
              {categories.length > 1 && (
                <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 ml-2 select-none">
                  <GripVertical size={11} className="text-zinc-600" />
                  Drag to reorder
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
