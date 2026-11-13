import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  BookmarkPlus,
  SlidersHorizontal,
  ChevronDown,
  Command,
  Globe,
  ExternalLink,
  Hash,
  X,
  Camera,
  Settings2,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { UserProfile, LinkItem, Category } from '../types.ts';
import { extractDomain } from '../utils/vaultLogic.ts';
import {
  compressAvatarFile,
  formatNavbarUserName,
  getUserInitials,
} from '../utils/avatarUtils.ts';
import { playRetroClick } from '../utils/sound.ts';
import { Button } from './ui/Button.tsx';
import { Kbd } from './ui/Kbd.tsx';
import { LinkHubLogo } from './LinkHubLogo.tsx';
import { CategoryIcon } from './CategoryIcon.tsx';

interface NavbarProps {
  onAddLink: () => void;
  onLockVault: () => void;
  onSetPin: () => void;
  onImport: () => void;
  onExport: () => void;
  onScanQr: () => void;
  onShareCategoryQr?: () => void;
  onOpenCommandSearch: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  hasPin: boolean;
  user: UserProfile;
  onOpenSettings: () => void;
  onChangePhoto: (nextPhotoUrl: string) => Promise<void>;
  onSignOut: () => void;
  onShowToast?: (message: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  links?: LinkItem[];
  categories?: Category[];
  onOpenLink?: (link: LinkItem) => void;
  onSelectCategory?: (slug: string) => void;
  onSelectTag?: (tag: string) => void;
}

export const Navbar: React.FC<NavbarProps> = React.memo(
  ({
    onAddLink,
    onLockVault,
    onSetPin,
    onImport,
    onExport,
    onScanQr,
    onShareCategoryQr,
    onOpenCommandSearch,
    searchQuery,
    onSearchChange,
    hasPin,
    user,
    onOpenSettings,
    onChangePhoto,
    onSignOut,
    onShowToast,
    searchInputRef,
    links = [],
    categories = [],
    onOpenLink,
    onSelectCategory,
    onSelectTag,
  }) => {
    const [toolsOpen, setToolsOpen] = useState(false);
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const toolsMenuRef = useRef<HTMLDivElement>(null);
    const mobileToolsMenuRef = useRef<HTMLDivElement>(null);
    const desktopProfileMenuRef = useRef<HTMLDivElement>(null);
    const mobileProfileMenuRef = useRef<HTMLDivElement>(null);
    const mobileSearchWrapperRef = useRef<HTMLDivElement>(null);
    const desktopSearchWrapperRef = useRef<HTMLDivElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      setAvatarFailed(false);
    }, [user.photoURL]);

    // Morph full-width navbar into a floating rounded capsule when scrolled
    useEffect(() => {
      let ticking = false;
      const updateScrollState = () => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        setIsScrolled((prev) => {
          if (!prev && y > 24) return true;
          if (prev && y <= 10) return false;
          return prev;
        });
        ticking = false;
      };
      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(updateScrollState);
        }
      };
      updateScrollState();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
          setToolsOpen(false);
        }
        if (mobileToolsMenuRef.current && !mobileToolsMenuRef.current.contains(target)) {
          setMobileToolsOpen(false);
        }
        if (desktopProfileMenuRef.current && !desktopProfileMenuRef.current.contains(target)) {
          setProfileMenuOpen(false);
        }
        if (mobileProfileMenuRef.current && !mobileProfileMenuRef.current.contains(target)) {
          setMobileProfileOpen(false);
        }
        const inMobileSearch =
          mobileSearchWrapperRef.current && mobileSearchWrapperRef.current.contains(target);
        const inDesktopSearch =
          desktopSearchWrapperRef.current && desktopSearchWrapperRef.current.contains(target);
        if (!inMobileSearch && !inDesktopSearch) {
          setSuggestionsOpen(false);
        }
      };
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setToolsOpen(false);
          setMobileToolsOpen(false);
          setProfileMenuOpen(false);
          setMobileProfileOpen(false);
        }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setUploadingPhoto(true);
      try {
        const compressedUrl = await compressAvatarFile(file, 128);
        await onChangePhoto(compressedUrl);
        setProfileMenuOpen(false);
        setMobileProfileOpen(false);
        onShowToast?.('Profile photo updated!', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Photo upload failed!';
        onShowToast?.(msg.endsWith('!') ? msg : `${msg}!`, 'error');
      } finally {
        setUploadingPhoto(false);
      }
    };

    const resolvedName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName;
    const initials = getUserInitials(resolvedName, user.email);
    const shortDisplayName = formatNavbarUserName(user.displayName, user.firstName, user.email);
    const fullName = resolvedName || 'Account';

    const renderAvatar = (sizeClasses: string, textClasses: string) => {
      if (user.photoURL && !avatarFailed) {
        return (
          <img
            src={user.photoURL}
            alt={fullName}
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className={`${sizeClasses} rounded-full object-cover border border-white/15 shrink-0`}
          />
        );
      }
      return (
        <span
          className={`${sizeClasses} rounded-full bg-gradient-to-br from-[#ff9000]/25 to-[#fa6318]/20 border border-[#ff9000]/40 text-[#ff9000] flex items-center justify-center font-bold tracking-tight shrink-0 ${textClasses}`}
        >
          {initials}
        </span>
      );
    };

    const renderMobileProfileIcon = () => {
      if (user.photoURL && !avatarFailed) {
        return (
          <img
            src={user.photoURL}
            alt={fullName}
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="w-6.5 h-6.5 rounded-full object-cover border border-white/15 shrink-0"
          />
        );
      }
      return (
        <span className="w-6.5 h-6.5 rounded-full bg-gradient-to-br from-[#ff9000]/25 to-[#fa6318]/20 border border-[#ff9000]/40 text-[#ff9000] flex items-center justify-center shrink-0">
          <UserIcon size={13} strokeWidth={2.2} />
        </span>
      );
    };

    const renderProfilePopover = (closeMenu: () => void) => (
      <div
        role="menu"
        aria-label="Account menu"
        className="absolute right-0 top-[calc(100%+10px)] w-72 max-w-[calc(100vw-1.5rem)] bg-[#111116]/98 backdrop-blur-2xl border border-white/[0.14] shadow-[0_24px_64px_rgba(0,0,0,0.92)] rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* User Identity Card */}
        <div className="p-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingPhoto}
              title="Change profile photo"
              aria-label="Change profile photo"
              className="relative group rounded-full shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9000]"
            >
              {renderAvatar('w-12 h-12', 'text-sm')}
              <span className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={15} className="text-white" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#1a1a22] border border-white/20 text-[#ff9000] flex items-center justify-center shadow">
                <Camera size={10} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="font-title text-sm font-bold text-white truncate">
                {fullName}
              </div>
              <div className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</div>
            </div>
          </div>
        </div>

        {/* Account Actions */}
        <div className="p-1.5">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              playRetroClick();
              closeMenu();
              onOpenSettings();
            }}
            className="w-full px-3 py-2 rounded-xl text-left text-xs font-medium text-zinc-200 hover:bg-white/[0.07] hover:text-white flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Settings2 size={14} className="text-zinc-400 shrink-0" />
            <span>Profile &amp; Settings</span>
          </button>

          <div className="my-1 border-t border-white/[0.07]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              playRetroClick();
              closeMenu();
              onSignOut();
            }}
            className="w-full px-3 py-2 rounded-xl text-left text-xs font-medium text-zinc-200 hover:bg-white/[0.07] hover:text-white flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <LogOut size={14} className="text-zinc-400 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matchedLinks = useMemo(() => {
      if (!normalizedQuery) return [];
      return links
        .filter(
          (l) =>
            l.title.toLowerCase().includes(normalizedQuery) ||
            l.url.toLowerCase().includes(normalizedQuery) ||
            (l.description || '').toLowerCase().includes(normalizedQuery) ||
            (l.tags || []).some((t) => t.toLowerCase().includes(normalizedQuery))
        )
        .slice(0, 5);
    }, [links, normalizedQuery]);

    const matchedCategories = useMemo(() => {
      if (!normalizedQuery) return [];
      return categories
        .filter((c) => c.name.toLowerCase().includes(normalizedQuery))
        .slice(0, 3);
    }, [categories, normalizedQuery]);

    const matchedTags = useMemo(() => {
      if (!normalizedQuery) return [];
      const tagSet = new Set<string>();
      const cleanTagQuery = normalizedQuery.replace(/^#/, '');
      if (!cleanTagQuery) return [];
      links.forEach((l) => {
        (l.tags || []).forEach((t) => {
          if (t.toLowerCase().includes(cleanTagQuery)) {
            tagSet.add(t);
          }
        });
      });
      return Array.from(tagSet).slice(0, 4);
    }, [links, normalizedQuery]);

    const hasSuggestions =
      matchedLinks.length > 0 || matchedCategories.length > 0 || matchedTags.length > 0;

    const renderSuggestionsDropdown = () => {
      if (!suggestionsOpen || !normalizedQuery) return null;

      return (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] bg-[#131319]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.9)] py-2 z-50 max-h-[340px] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150">
          {!hasSuggestions ? (
            <div className="px-4 py-4 text-center text-xs text-zinc-400">
              No matching links or categories for &ldquo;{searchQuery.trim()}&rdquo;
            </div>
          ) : (
            <div className="space-y-2">
              {matchedLinks.length > 0 && (
                <div>
                  <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Suggested Links
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {matchedLinks.map((link) => {
                      const domain = extractDomain(link.url);
                      return (
                        <button
                          key={link.id}
                          type="button"
                          onClick={() => {
                            playRetroClick();
                            setSuggestionsOpen(false);
                            if (onOpenLink) {
                              onOpenLink(link);
                            }
                          }}
                          className="w-full px-3.5 py-2 text-left hover:bg-white/[0.07] active:bg-white/[0.1] flex items-center justify-between gap-2.5 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                              {link.faviconUrl ? (
                                <img
                                  src={link.faviconUrl}
                                  alt=""
                                  className="w-4 h-4 object-contain rounded-[3px]"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Globe size={13} className="text-[#ff9000]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white truncate">
                                {link.title}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-400 truncate">
                                {domain}
                              </div>
                            </div>
                          </div>
                          <ExternalLink size={12} className="text-zinc-500 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {matchedCategories.length > 0 && (
                <div>
                  <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Categories
                  </div>
                  <div>
                    {matchedCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          playRetroClick();
                          setSuggestionsOpen(false);
                          onSearchChange('');
                          if (onSelectCategory) {
                            onSelectCategory(cat.slug);
                          }
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-white/[0.07] active:bg-white/[0.1] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <span className="w-6 h-6 rounded-md bg-[#ff9000]/15 text-[#ff9000] flex items-center justify-center shrink-0">
                          <CategoryIcon name={cat.icon || cat.slug} size={12} />
                        </span>
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {cat.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchedTags.length > 0 && (
                <div className="px-3.5 pt-1 pb-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {matchedTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          playRetroClick();
                          setSuggestionsOpen(false);
                          onSearchChange('');
                          if (onSelectTag) {
                            onSelectTag(tag);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-[#ff9000]/15 border border-white/[0.08] text-[11px] font-mono text-zinc-300 hover:text-[#ff9000] transition-colors cursor-pointer"
                      >
                        <Hash size={10} className="text-[#ff9000]" />
                        <span>{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <header
        data-scrolled={isScrolled ? 'true' : 'false'}
        className={`fixed top-0 inset-x-0 md:sticky md:top-0 z-40 w-full transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isScrolled ? 'pt-0 px-0 md:pt-3 md:px-6 md:pointer-events-none' : 'pt-0 px-0'
        }`}
      >
        {/* Shared Hidden Avatar File Input */}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarFileSelected}
          aria-label="Upload profile photo"
          className="hidden"
        />

        {/* Fixed Mobile Bar / Floating Pill Shell on Desktop Scroll */}
        <div
          data-navbar-shell="true"
          className={`pointer-events-auto mx-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            isScrolled
              ? 'max-w-full rounded-none bg-[#09090c]/95 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)] md:max-w-5xl md:rounded-full md:bg-[#111116]/94 md:border md:border-white/[0.13] md:shadow-[0_18px_48px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.04)]'
              : 'max-w-full rounded-none bg-[#09090c]/90 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)]'
          }`}
        >
          {/* ===================================================================
              MOBILE NAVBAR (< md): Fixed Top Bar + Profile Icon & DD Initials
             =================================================================== */}
          <div className="flex md:hidden flex-col gap-2 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <LinkHubLogo size="sm" />

              {/* Mobile Profile Trigger with Account Popover */}
              <div className="relative" ref={mobileProfileMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setMobileToolsOpen(false);
                    setMobileProfileOpen((prev) => !prev);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={mobileProfileOpen}
                  aria-label={`Account menu (${initials})`}
                  className="h-8.5 pl-1 pr-2 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.12] flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  {renderMobileProfileIcon()}
                  <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-100">
                    {initials}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`text-zinc-400 transition-transform duration-200 ${mobileProfileOpen ? 'rotate-180 text-[#ff9000]' : ''}`}
                  />
                </button>

                {mobileProfileOpen && renderProfilePopover(() => setMobileProfileOpen(false))}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full">
              <div ref={mobileSearchWrapperRef} className="relative flex-1 min-w-0">
                <div className="relative flex items-center gap-2 w-full bg-[#14141a] border border-white/[0.09] focus-within:border-[#ff9000] transition-all px-3 h-9 rounded-xl">
                  <Search size={14} strokeWidth={2} className="text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onFocus={() => setSuggestionsOpen(true)}
                    onChange={(e) => {
                      onSearchChange(e.target.value);
                      setSuggestionsOpen(true);
                    }}
                    placeholder="Search links..."
                    className="w-full min-w-0 bg-transparent text-[13px] text-white placeholder:text-xs placeholder:text-zinc-500 outline-none caret-[#ff9000]"
                    aria-label="Search links"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchChange('');
                        setSuggestionsOpen(false);
                      }}
                      className="text-zinc-400 hover:text-white p-1 rounded-full shrink-0 cursor-pointer"
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {renderSuggestionsDropdown()}
              </div>

              <div className="relative shrink-0" ref={mobileToolsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileOpen(false);
                    setMobileToolsOpen(!mobileToolsOpen);
                  }}
                  aria-label="Vault Tools"
                  title="Vault Tools"
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                    mobileToolsOpen
                      ? 'bg-white/[0.12] text-[#ff9000] border-[#ff9000]/50'
                      : 'bg-[#14141a] hover:bg-white/[0.08] border-white/[0.09] text-[#ff9000]'
                  }`}
                >
                  <SlidersHorizontal size={15} strokeWidth={2.2} />
                </button>

                {mobileToolsOpen && (
                  <div className="absolute right-0 top-11 w-56 max-w-[calc(100vw-1.5rem)] bg-[#111115]/98 backdrop-blur-2xl border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.9)] rounded-2xl py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2 text-[11px] uppercase font-bold text-zinc-400 tracking-widest border-b border-white/[0.08] mb-1">
                      VAULT MANAGEMENT
                    </div>

                    {onShareCategoryQr && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          onShareCategoryQr();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                      >
                        SHARE CATEGORY QR
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onScanQr();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      SCAN / ENTER SHARE CODE
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onSetPin();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      {hasPin ? 'CHANGE SECURITY PIN' : 'SET SECURITY PIN'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onImport();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      IMPORT BOOKMARKS
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onExport();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      EXPORT BACKUP
                    </button>

                    <div className="my-1.5 border-t border-white/[0.08]" />

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onLockVault();
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors font-bold uppercase tracking-wider cursor-pointer"
                    >
                      LOCK VAULT SESSION
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===================================================================
              DESKTOP NAVBAR (md+): Morphs smoothly into a Floating Pill on scroll
             =================================================================== */}
          <div
            className={`hidden md:flex items-center justify-between gap-3 lg:gap-4 mx-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              isScrolled ? 'max-w-5xl px-4 lg:px-5 h-14' : 'max-w-7xl px-6 h-16'
            }`}
          >
            {/* Left: Brand Identity */}
            <div className="flex items-center shrink-0">
              <LinkHubLogo size="md" />
            </div>

            {/* Center: Search Bar */}
            <div
              ref={desktopSearchWrapperRef}
              className="relative flex-1 min-w-[180px] max-w-sm lg:max-w-md mx-auto"
            >
              <div
                className={`relative flex items-center gap-2.5 w-full glass-input focus-within:border-[#ff9000] focus-within:ring-2 focus-within:ring-[#ff9000]/20 transition-all px-4 ${
                  isScrolled ? 'rounded-full h-9 py-1' : 'rounded-xl h-10 py-1.5'
                }`}
              >
                <Search size={15} className="text-zinc-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSuggestionsOpen(true)}
                  onChange={(e) => {
                    onSearchChange(e.target.value);
                    setSuggestionsOpen(true);
                  }}
                  placeholder="Search links..."
                  className="w-full min-w-0 bg-transparent text-[13px] text-white search-typing-font placeholder:font-sans placeholder:font-normal placeholder:text-xs placeholder:text-zinc-400 outline-none caret-[#ff9000] selection:bg-[#ff9000] selection:text-black"
                  aria-label="Search links"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange('');
                      setSuggestionsOpen(false);
                    }}
                    className="text-zinc-400 hover:text-white p-0.5 rounded-full shrink-0 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenCommandSearch}
                    title="Open Spotlight Search (⌘K)"
                    className="shrink-0 ml-1 inline-flex items-center cursor-pointer"
                  >
                    <Kbd className="bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-[#ff9000] border-white/[0.1] h-6 px-2 rounded-md inline-flex items-center justify-center gap-1 leading-none transition-colors">
                      <Command size={11} strokeWidth={2.2} className="shrink-0" />
                      <span className="text-[10px] font-sans font-semibold leading-none text-zinc-400">
                        +
                      </span>
                      <span className="text-[11px] font-mono font-bold leading-none">K</span>
                    </Kbd>
                  </button>
                )}
              </div>

              {renderSuggestionsDropdown()}
            </div>

            {/* Right: Organized Actions & Industry-Standard Account Menu */}
            <div className="flex items-center gap-2 lg:gap-2.5 shrink-0">
              <Button
                size="sm"
                color="primary"
                variant="solid"
                onClick={onAddLink}
                className={`font-bold text-xs h-9 px-3.5 shadow-sm shadow-[#ff9000]/25 uppercase tracking-wider whitespace-nowrap shrink-0 transition-all ${
                  isScrolled ? 'rounded-full' : 'rounded-lg'
                }`}
                startContent={<BookmarkPlus size={16} strokeWidth={2.25} />}
              >
                ADD LINK
              </Button>

              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setToolsOpen(!toolsOpen);
                  }}
                  className={`flex items-center gap-1.5 h-9 px-3 text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isScrolled ? 'rounded-full' : 'rounded-lg'
                  } ${
                    toolsOpen
                      ? 'bg-white/[0.12] text-[#ff9000] border-[#ff9000]/50 backdrop-blur-xl'
                      : 'glass-input hover:bg-white/[0.08] text-zinc-200'
                  }`}
                  aria-label="Vault Tools"
                >
                  <SlidersHorizontal size={13} className="text-[#ff9000]" />
                  <span className="uppercase tracking-wider font-bold">TOOLS</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {toolsOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] w-56 bg-[#111115]/98 backdrop-blur-2xl border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.9)] rounded-2xl py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2 text-[11px] uppercase font-bold text-zinc-400 tracking-widest border-b border-white/[0.08] mb-1">
                      VAULT MANAGEMENT
                    </div>

                    {onShareCategoryQr && (
                      <button
                        type="button"
                        onClick={() => {
                          setToolsOpen(false);
                          onShareCategoryQr();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                      >
                        SHARE CATEGORY QR
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        onScanQr();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      SCAN / ENTER SHARE CODE
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        onSetPin();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      {hasPin ? 'CHANGE SECURITY PIN' : 'SET SECURITY PIN'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        onImport();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      IMPORT BOOKMARKS
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        onExport();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors cursor-pointer"
                    >
                      EXPORT BACKUP
                    </button>

                    <div className="my-1.5 border-t border-white/[0.08]" />

                    <button
                      type="button"
                      onClick={() => {
                        setToolsOpen(false);
                        onLockVault();
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.07] hover:text-[#ff9000] transition-colors font-bold uppercase tracking-wider cursor-pointer"
                    >
                      LOCK VAULT SESSION
                    </button>
                  </div>
                )}
              </div>

              {/* Industry-Standard Account Pill + Popover */}
              <div className="relative" ref={desktopProfileMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    playRetroClick();
                    setToolsOpen(false);
                    setProfileMenuOpen((prev) => !prev);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-label="Account menu"
                  title={`${fullName} (${user.email})`}
                  className={`h-9 pl-1.5 pr-2.5 border flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isScrolled ? 'rounded-full' : 'rounded-xl'
                  } ${
                    profileMenuOpen
                      ? 'bg-white/[0.12] border-[#ff9000]/50 text-white'
                      : 'glass-input hover:bg-white/[0.08] text-zinc-200'
                  }`}
                >
                  {renderAvatar('w-6.5 h-6.5', 'text-[10px]')}
                  <span className="text-xs font-semibold text-zinc-100 max-w-[116px] truncate">
                    {shortDisplayName}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-zinc-400 transition-transform duration-200 ${
                      profileMenuOpen ? 'rotate-180 text-[#ff9000]' : ''
                    }`}
                  />
                </button>

                {profileMenuOpen && renderProfilePopover(() => setProfileMenuOpen(false))}
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }
);
