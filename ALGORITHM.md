# Hypatia InterpreterPro — ALGORITHM.md

> **This file is the source of truth.** Read it before making any changes.
> It exists to prevent agent drift and keep every developer aligned.

---

## What Hypatia Is

A real-time, collaborative Russian-English interpretation app for high-stakes technical environments (medical engineering conferences). Two users join a shared session via URL, speak into their phones, and see a live bilingual transcript synchronized across both devices via Firebase Firestore.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS 4 |
| AI (STT + Translation) | Google Gemini via `@google/genai` v1.x |
| Real-time sync | Firebase Firestore |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting target | Firebase Hosting / any static host |

---

## Correct Model Names (as of May 2026)

```ts
const STT_MODEL       = 'gemini-2.0-flash';   // audio transcription
const TRANSLATE_MODEL = 'gemini-2.0-flash';   // translation + dictionary
```

> **Do NOT use:** `gemini-3-flash-preview`, `gemini-3.1-pro-preview` — these do not exist.
> If you need higher translation quality, use `gemini-1.5-pro` for TRANSLATE_MODEL.

---

## Environment Variables

Set in `.env` (loaded by Vite via `loadEnv`):

```
GEMINI_API_KEY=AIza...          # Required. Get free at aistudio.google.com
APP_URL=https://...             # Optional. Injected by Cloud Run at runtime.
```

Vite exposes `GEMINI_API_KEY` via `process.env.GEMINI_API_KEY` (see `vite.config.ts` define block). Do **not** rename to `VITE_GEMINI_API_KEY`.

---

## Core Architecture

### 1. Session Management
- Session ID lives in the URL query param `?session=<id>`
- First user creates a session via `setDoc(db, 'sessions', id, {...})`
- Partner opens the shared URL — no login wall, but auth resolves before Firestore listener starts
- **Critical:** Always wait for `onAuthStateChanged` to resolve (`authLoaded = true`) before starting the Firestore `onSnapshot` listener. Listening before auth resolves causes permission errors.

### 2. Speech-to-Text (STT) — Audio Chunking

```
MediaRecorder → 8-second WebM chunk → FileReader (base64) → Gemini STT → transcript text
```

- Records in 8-second bursts using `MediaRecorder`
- Sends base64-encoded WebM audio to Gemini as `inlineData`
- **`contents` must be an array:** `contents: [{ parts: [{ text }, { inlineData }] }]`
- If Gemini returns `[SILENCE]` or empty, discard the chunk — do not create a message
- STT prompt: *"Transcribe speech verbatim. Context: Medical Engineering. Language: [EN/RU]. Return [SILENCE] if no speech."*

### 3. Translation

```
transcript text → Gemini translate prompt → JSON { originalCleaned, translated } → Firestore
```

**Translation Prompt Rules (non-negotiable):**
1. **Logic Polarity:** A negative in the source must be negative in the output. `"not stable"` → `"нестабильный"` (NOT `"стабильный"`). This is a hard constraint.
2. **Medical precision:** Use professional biomedical terminology (cardiology, ECMO, dialysis, nanotech, biosensors).
3. **Spoken register:** Output natural spoken language, not formal written prose.
4. Return JSON: `{ "originalCleaned": "...", "translated": "..." }`

### 4. Firestore Data Model

```
Firestore root
└── sessions/{sessionId}
    ├── id: string
    ├── name: string            ← Required by security rules
    ├── createdAt: timestamp
    ├── createdBy: uid
    └── messages/{messageId}
        ├── en: string          ← English text (original or translated)
        ├── ru: string          ← Russian text (original or translated)
        ├── sourceLang: 'en' | 'ru'
        ├── timestamp: serverTimestamp
        ├── userId: uid
        └── userName: string
```

> **Security rule gotcha:** Both `en` and `ru` must be non-null strings (use `|| ""` fallback if translation fails). The `name` field is required on the session document.

### 5. Dictionary Lookup

- User taps any word in the transcript
- Sends word to Gemini with medical/bioengineering context
- Returns JSON: `{ word, translation, definition, examples, grammar }`
- Displayed in a slide-up drawer (AnimatePresence motion.div)

---

## UI Layout

```
┌─────────────────────────────────┐
│ HEADER: Logo │ Status │ Share   │
├─────────────────────────────────┤
│                                 │
│  TOP ZONE — Russian (amber)     │  ← Scrollable, flex:1
│  Live RU feed + translations    │
│                                 │
├─────────────────────────────────┤
│                                 │
│  BOTTOM ZONE — English (zinc)   │  ← Scrollable, flex:1
│  Live EN feed + translations    │
│                                 │
├─────────────────────────────────┤
│ FOOTER: [text input] [EN|RU] 🎤 │
└─────────────────────────────────┘
```

**Design tokens:**
- Background: `#080808`
- Surface: `#0a0a0a`, `#0f0f0f`
- Accent: `#f59e0b` (amber-500)
- Russian text: amber, font-weight 500
- English text: zinc-200, font-weight 300
- Font: System sans for UI, Georgia serif italic for labels/drawer headings

---

## Known Issues & Fixes Applied

| Issue | Fix |
|---|---|
| Wrong model names (`gemini-3-flash-preview`) | Changed to `gemini-2.0-flash` |
| Auth race condition on Firestore listener | Listener now waits for `authLoaded` |
| Missing `name` field on session doc | Added to `setDoc` payload |
| Empty `en`/`ru` strings failing security rules | Added `\|\| ""` fallback on translation result |
| `contents` as object instead of array for audio | Fixed to `contents: [{ parts: [...] }]` |

---

## Development Commands

```bash
npm install
npm run dev        # starts on port 3000
npm run build      # production build to /dist
npm run lint       # TypeScript type check
```

Create `.env` from `.env.example` and fill in `GEMINI_API_KEY`.

---

## Roadmap (do not implement unless instructed)

- [ ] Multi-participant sessions (3+ speakers)
- [ ] Session save to user account
- [ ] Download transcript as PDF
- [ ] Offline PWA mode
- [ ] Expand to other language pairs
- [ ] React Native / Expo port for App Store
