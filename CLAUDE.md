# CLAUDE.md — Hypatia InterpreterPro (React App)
## Project Memory File — Read This First Every Session

---

## Who Is Peter

Peter is the founder and sole developer-by-proxy of Hypatia. He works via Claude Code (web) and has no formal coding background — he directs AI agents to build. He has grandiose, well-considered plans and a clear product vision. He is often working under financial and time pressure. Windows user (FrankyForlon on GitHub).

Key context:
- Preparing for a **Medical Engineering Conference at University of Utah** — ~30 Russian-speaking doctors/researchers/engineers from CIS countries
- Wants Hypatia to become "the Zoom of translation" — the go-to for translingual communication
- Legal obligation (State v. Golub) competes for time
- KISS principle is paramount. Never over-engineer. Ship working things.
- He has grandiose plans he wants documented — see Roadmap section

---

## What This Repo Is

**Hypatia-InterpreterPro** is the **full production version** — React 19, Vite 6, TypeScript, Tailwind CSS 4, Firebase Firestore + Auth.

This is the version that supports **two people on different devices in the same live session.**

The standalone demo/prototype is in the separate repo: `hypatia-interpreterproii` (single `index.html`, no build).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS 4 |
| AI | Google Gemini 2.0 Flash via REST API |
| Real-time sync | Firebase Firestore |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting | Firebase Hosting (Blaze plan, configured) |

---

## Correct Model Names (NEVER change without testing)

```ts
const TRANSLATE_MODEL = 'gemini-2.0-flash';
const STT_MODEL       = 'gemini-2.0-flash';  // if using audio chunking
```

Dead model names — never use:
- `gemini-3-flash-preview` (does not exist)
- `gemini-3.1-pro-preview` (does not exist)
- `gemini-1.5-flash` (deprecated May 2026)

---

## Firebase Project

Project name: **InterpreterPro**
Plan: Blaze (pay-as-you-go)
Configured: Firestore, Auth (Identity Platform), Hosting
Authorized domains: localhost, gen-lang-client-*.firebaseapp.com, *.web.app

---

## Architecture

### Session Flow
1. User A opens app → creates session → gets URL with `?session=<id>`
2. User A shares URL with User B
3. User B opens URL → joins same Firestore session instantly
4. No login wall required to join (auth resolves anonymously)
5. **Critical:** Always wait for `onAuthStateChanged` (`authLoaded = true`) before starting Firestore `onSnapshot` listener — otherwise permission errors

### Firestore Data Model
```
sessions/{sessionId}
  ├── id: string
  ├── name: string          ← Required by security rules
  ├── createdAt: timestamp
  ├── createdBy: uid
  └── messages/{messageId}
      ├── en: string        ← English text (never null — use "" fallback)
      ├── ru: string        ← Russian text (never null — use "" fallback)
      ├── sourceLang: 'en' | 'ru'
      ├── speakerName: string   ← Added in Phase 2
      ├── timestamp: serverTimestamp
      ├── userId: uid
      └── userName: string
```

### Speech Recognition Strategy
Use **Web Speech API** (not 8s audio chunking) — lower latency, simpler, works well in Chrome on mobile.
```js
recObj.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
recObj.continuous = true;
recObj.interimResults = true;
```
Auto-restart on `onend` to keep listening continuously.

---

## Phase Plan

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Deploy to Firebase Hosting | Pending |
| 1 | Multi-device sessions (share link → partner joins, both see same feed) | In progress |
| 2 | Speaker identity (name prompt on join, "Anton:" shows in transcript) | Not started |
| 3 | Dual clean transcripts (EN + RU, downloadable with speaker names) | Not started |
| 4 | Correction loop (tap segment → edit → re-translate → sync to all) | Not started |
| 5 | Optional accounts (name persists, session history saved) | Not started |
| Future | Multi-language, multi-participant, audience mode, PWA | Roadmap |

---

## Peter's Full Vision (Roadmap — do not implement unless asked)

### Near term (conference + post-conference)
- Two-person session works reliably on mobile Chrome
- Speaker names in transcript
- Downloadable EN + RU transcripts
- Optional account creation

### Medium term
- Edit any segment → re-translate → propagates to partner instantly
- Session history in user account
- QR code for easy session joining
- Custom session names

### Long term / "Zoom of translation" vision
- Any language pair (not just EN/RU)
- Multi-participant sessions (panel discussions, conferences)
- Audience mode (read-only, join via QR)
- Audience can submit questions via app during Q&A
- Speaker notes + annotations synced across devices
- Domain-specific context packs (medical, legal, tech, arts)
- Users can choose their own dictionaries/reference tools
- Abby Lingvo-quality dictionary integration
- Export as PDF with speaker attribution
- Share via SMS/email directly from app
- Plaid-style integrations with other apps
- PWA for offline resilience
- Eventually: React Native / Expo for App Store

### Moonshot
- Not just language translation but cultural/knowledge interpretation
- "Your own expert adjutant" — understands domain, explains context, not just words
- Conference/lecture mode: transcribe a speaker, let audience interact with transcript live
- Student mode: transcribe lecture, students look up terms, ask questions, add notes
- The app works for any high-context situation where language or knowledge barriers exist

---

## Design Tokens (Never change without Peter's approval)

```css
--bg: #080808
--amber: #f59e0b        /* Russian text, accents */
--text: #e4e4e7         /* English text */
--surf: #0f0f0f
--surf2: #1a1a1a
--border: rgba(255,255,255,0.07)
```

Vibe: Medical chart / laboratory terminal. Swiss design minimal. High contrast. Zero fluff. Not a social media app.

---

## PRD Core (What the app must do — conference version)

1. Two people open the same URL on their phones (different cities, different countries — works anywhere)
2. One speaks English, one speaks Russian
3. Both see the full bilingual conversation in real time — same screen
4. Every utterance attributed to speaker name ("Anton:" / "Mark:")
5. Tap any word → clinical definition slide-up drawer
6. At end of session → download EN transcript + RU transcript
7. The transcript is verbatim first — accuracy of original > quality of translation

---

## Known Issues Fixed

| Issue | Fix applied |
|---|---|
| Wrong model names (gemini-3-flash-preview) | Changed to gemini-2.0-flash |
| Auth race condition on Firestore listener | Wait for authLoaded before onSnapshot |
| Missing `name` field on session doc | Added to setDoc payload |
| Empty en/ru strings failing security rules | Added `\|\| ""` fallback |
| contents as object not array for audio API | Fixed to contents: [{parts:[...]}] |

---

## Dev Commands

```bash
npm install
npm run dev -- --host    # binds to network so phone can connect
npm run build
firebase deploy --only hosting
```

Create `.env` from `.env.example`, set `GEMINI_API_KEY`.

---

## What To Do Next Session

1. Verify Phase 1 multi-device sync is working (two devices, same session URL)
2. Add speaker name prompt on session join
3. Show speaker name on every message segment
4. Deploy to Firebase Hosting so it has a permanent public URL
