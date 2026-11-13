export interface LinkItem {
  id: string;
  userId?: string;
  title: string;
  url: string;
  categorySlug: string;
  description: string;
  tags: string[];
  isFavorite: boolean;
  clickCount: number;
  imageUrl: string;
  faviconUrl: string;
  createdAt: number;
  updatedAt: number;
  isEncrypted?: boolean;
}

export interface Category {
  id: string;
  userId?: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  description: string;
  isDefault: boolean;
  createdAt: number;
  order: number;
  isPrivate?: boolean;
  privatePinHash?: string;
  privatePin?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  pin: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  countryCode?: string;
  jobTitle?: string;
  company?: string;
  bio?: string;
  securityQuestion?: string;
  securityAnswer?: string;
}

export type ViewMode = 'grid' | 'list' | 'table';

export type SortOption = 'recent' | 'oldest' | 'visits' | 'alpha' | 'alpha-desc';
