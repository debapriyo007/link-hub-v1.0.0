import React from 'react';
import {
  Clapperboard,
  Film,
  Tv,
  GraduationCap,
  BookOpen,
  BookMarked,
  Compass,
  Globe,
  Briefcase,
  FolderOpen,
  Bookmark,
  FileText,
  Code2,
  Terminal,
  Sparkles,
  Layers,
  Video,
  Headphones,
  Gamepad2,
  Cpu,
  Star,
  Tag,
  Link,
  ShieldCheck,
  Flame,
  Rocket,
  Palette,
  Database,
  Target,
  CheckSquare,
  Calendar,
  Clock,
  Zap,
  TrendingUp,
  Lightbulb,
  Wallet,
  Bot,
  ShoppingBag,
  HeartPulse,
  Trophy,
  LockKeyhole,
  LucideProps,
} from 'lucide-react';

interface CategoryIconProps extends LucideProps {
  name?: string;
  size?: number;
  className?: string;
}

const EighteenPlusIcon: React.FC<LucideProps> = ({
  size = 15,
  className = '',
  strokeWidth = 2.2,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="4" width="20" height="16" rx="4" />
    <path d="M6.5 9.5v5" />
    <circle cx="11.5" cy="10.6" r="1.35" />
    <circle cx="11.5" cy="13.4" r="1.45" />
    <path d="M16.8 10.5v3" />
    <path d="M15.3 12h3" />
  </svg>
);

const ICON_MAP: Record<string, React.FC<LucideProps>> = {
  entertainment: Clapperboard,
  clapperboard: Clapperboard,
  film: Clapperboard,
  tv: Tv,
  video: Video,
  study: GraduationCap,
  'graduation-cap': GraduationCap,
  education: BookOpen,
  book: BookOpen,
  'book-open': BookOpen,
  documentation: FileText,
  docs: FileText,
  information: Compass,
  compass: Compass,
  globe: Globe,
  work: Briefcase,
  briefcase: Briefcase,
  folder: FolderOpen,
  reading: BookMarked,
  bookmark: BookMarked,
  article: FileText,
  development: Code2,
  code: Code2,
  dev: Code2,
  terminal: Terminal,
  sparkles: Sparkles,
  layers: Layers,
  music: Headphones,
  headphones: Headphones,
  gaming: Gamepad2,
  tech: Cpu,
  star: Star,
  tag: Tag,
  link: Link,
  shield: ShieldCheck,
  flame: Flame,
  rocket: Rocket,
  palette: Palette,
  design: Palette,
  database: Database,
  '18+': EighteenPlusIcon,
  adult: EighteenPlusIcon,
  eighteen: EighteenPlusIcon,
  target: Target,
  'check-square': CheckSquare,
  tasks: CheckSquare,
  calendar: Calendar,
  clock: Clock,
  zap: Zap,
  'trending-up': TrendingUp,
  analytics: TrendingUp,
  lightbulb: Lightbulb,
  ideas: Lightbulb,
  wallet: Wallet,
  finance: Wallet,
  bot: Bot,
  ai: Bot,
  shopping: ShoppingBag,
  heart: HeartPulse,
  health: HeartPulse,
  trophy: Trophy,
  lock: LockKeyhole,
  film_raw: Film,
  bookmark_raw: Bookmark,
};

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  name = 'folder',
  size = 15,
  className = '',
  strokeWidth = 2.2,
  ...props
}) => {
  const normalized = (name || '').toLowerCase().trim();
  const IconComponent = ICON_MAP[normalized] || FolderOpen;
  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      {...props}
    />
  );
};

