# LINKHUB — Encrypted Personal Cloud Bookmark Vault

LINKHUB is a full-stack, security-first cloud bookmark manager designed for organizing, searching, and launching mission-critical web resources from any device. Built with React, TypeScript, Tailwind CSS, Express, and Firebase (Authentication + Cloud Firestore), it combines zero-history stealth reading, PIN-gated auto-lock protection, encrypted private categories, QR link beaming, and server-side AI metadata enrichment.

---

## Key Features

### Vault Organization & Discovery
- **Curated Default Categories + Custom Collections**: Ships with `Study`, `Development`, `Entertainment`, `Documentation`, and `Reading` out of the box, with drag-and-drop reordering and custom category creation.
- **Spotlight Command Search (`⌘K` / `Ctrl+K`) & Live Suggestions**: Instant search across bookmark titles, URLs, descriptions, and tags, sorted by **Popular** first by default.
- **Grid & Table Views**: Switch between rich card previews and compact tabular browsing with starred Favorites filtering.
- **AI Smart Metadata Enrichment**: Automatically extracts page metadata and generates concise titles, descriptions, tags, and category suggestions via `/api/ai/link-metadata` using `@google/genai` (with domain-aware smart fallback when offline or unconfigured).

### Security & Privacy
- **Auto-Lock on Tab Switch**: Automatically locks the vault and clears unlocked private categories when switching browser tabs (`visibilitychange`), re-entering with a smooth GPU-composited zoom-in reveal when returning to the tab.
- **6-Digit Security PIN & Recovery**: Optional 6-digit PIN lock screen with physical keyboard + touch keypad support and security-question recovery.
- **Encrypted Private Categories**: Sensitive categories encrypt bookmark fields client-side (`privateVaultCrypto.ts`), stay hidden from `All Links` and `Favorites`, and require PIN verification before decryption.
- **Private Launch & Zero-History Stealth Reader**: Launches links through an isolated Private Launch sheet with a built-in SSRF-hardened server-side Stealth Reader (`/api/stealth/reader`) for zero-history article/page reading, clean URL copying, and private-window launch options.

### Portability & Account Experience
- **QR Beam Sharing & Import/Export**: Generate and scan QR codes or 6-character share payloads to beam individual links or entire categories, plus Netscape HTML bookmark import and backup export.
- **Responsive Morphing Navigation & Profile Management**: Desktop navbar morphs smoothly into a centered floating capsule on scroll; mobile stays pinned cleanly at the top with user initials and an account popover supporting client-side compressed photo uploads (`compressAvatarFile`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (`Outfit` UI typography + `JetBrains Mono` monospace), Lucide Icons
- **Backend**: Node.js + Express (`server.ts`) serving Vite middleware in dev and static assets in production
- **Database & Auth**: Firebase Authentication & Cloud Firestore with strict schema validation and per-user security rules (`firestore.rules`)
- **AI Integration**: `@google/genai` (server-side only)

---

## Project Structure

```text
├── index.html                  # App entry & Google Fonts (Outfit, JetBrains Mono)
├── server.ts                   # Express server, /api/ai/link-metadata, /api/stealth/reader
├── firestore.rules             # Per-user Firestore security rules & schema constraints
├── firestore.rules.test.ts     # Firestore security rule test suite
├── firebase-blueprint.json     # Firestore data model specification
├── public/
│   └── favicon.svg             # App icon
└── src/
    ├── App.tsx                 # Main vault state, Firestore sync, routing & modals
    ├── firebase.ts             # Firebase client SDK initialization
    ├── index.css               # Tailwind v4 theme tokens, glassmorphism & keyframes
    ├── types.ts                # Core TypeScript domain interfaces
    ├── data/
    │   └── initialData.ts      # Default categories & starter bookmarks
    ├── utils/
    │   ├── avatarUtils.ts      # Initials formatting & client-side image compression
    │   ├── categoryShare.ts    # QR category share encoding/decoding
    │   ├── privateVaultCrypto.ts # Client-side encryption for private categories
    │   ├── sound.ts            # Subtle retro audio feedback helpers
    │   └── vaultLogic.ts       # URL normalization, filtering, sorting, Netscape HTML I/O
    └── components/
        ├── Navbar.tsx          # Morphing desktop pill / fixed mobile header & account menu
        ├── LinkCard.tsx        # Bookmark card with private launch & quick actions
        ├── LinkTable.tsx       # Compact tabular bookmark view
        ├── CategoryPills.tsx   # Reorderable category filter bar
        ├── ProfileSettingsPage.tsx # Account profile, avatar, PIN & backup controls
        ├── LoginPage.tsx       # Authentication landing screen
        └── modals/
            ├── LockedScreen.tsx # Auto-lock screen with tab-return zoom-in reveal
            ├── IncognitoModal.tsx # Private Launch & Zero-History Stealth Reader modal
            ├── AddLinkModal.tsx # Bookmark editor with AI metadata autofill
            ├── CommandSearchModal.tsx # ⌘K global command palette
            └── ...             # Category, PIN, QR Share/Scan, Import/Export modals
```

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your server-side secrets:

```env
GEMINI_API_KEY="your_gemini_api_key"
APP_URL="http://localhost:3000"
```

Ensure `firebase-applet-config.json` contains your Firebase project configuration (`apiKey`, `authDomain`, `projectId`, `firestoreDatabaseId`).

### 3. Run Locally

```bash
npm run dev
```

The Express + Vite dev server starts on `http://localhost:3000`.

---

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Express + Vite development server on port `3000` |
| `npm run build` | Build production frontend bundle into `dist/` |
| `npm start` | Run production Express server (`server.ts`) |
| `npm run lint` | Run TypeScript type check (`tsc --noEmit`) |
| `npx tsx --test src/utils/vaultLogic.test.ts src/utils/avatarUtils.test.ts firestore.rules.test.ts` | Run unit & Firestore rules tests |

---

## Backend API Endpoints

- `POST /api/ai/link-metadata`: Accepts `{ url, categories }` and returns `{ title, description, tags, suggestedCategorySlug, source }` using Gemini metadata generation with HTML `<head>` inspection and domain fallback.
- `POST /api/stealth/reader`: Accepts `{ url }`, validates public HTTP/HTTPS targets against private/loopback/link-local SSRF blocks, and returns sanitized readable text blocks (`title`, `summary`, `paragraphs`).

---

## Security & Privacy Notes

- `GEMINI_API_KEY` is read strictly on the server inside `server.ts` and never exposed to client bundles.
- `/api/stealth/reader` blocks `localhost`, private IPv4/IPv6 ranges (`10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `fe80::`, `fc/fd`), and unsafe redirect targets.
- `firestore.rules` enforces authenticated per-user ownership, immutable audit fields (`createdAt`, `userId`), tag count caps, and field size bounds (including `32 KB` compressed avatar data URLs).
