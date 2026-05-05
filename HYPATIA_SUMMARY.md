# Hypatia InterpreterPro: Technical Summary
A mobile-first, real-time Russian-English transcription and translation tool for biomedical engineering.

## Core Architecture
- **Frontend:** React 18 / Vite / Tailwind CSS.
- **Backend:** Firebase (Firestore for real-time sync, Auth for session ownership).
- **Intelligence:** Google Gemini 1.5 Flash (STT via audio chunking) and Pro (Translation/Dictionary).

## Key Workflows
1. **The Split-Horizon:** Real-time dual-transcript view (Top/Bottom) shared via a URL sessionId.
2. **Audio Chunking (8s):** Bypasses buggy browser STT by streaming raw audio to Gemini for "Filtered Ear" transcription.
3. **The Correction Loop:** Manual edits to source segments trigger instant re-translation for the partner.
4. **Precision Lookup:** Tapping any technical term fetches a medical-context dictionary entry via Gemini.

---

# AI System Prompt (The Ideal Template)
"Build Hypatia: InterpreterPro. A mobile-first translation interface with vertical split (Partner on Top, User on Bottom). Integrate 8-second Audio Chunking to Gemini 1.5 Flash for high-precision Russian-English medical transcription. Sync state via Firestore to allow real-time collaboration. Add a dictionary lookup layer that returns JSON medical definitions on word tap. Principle: Precision over brevity. Maxim: KISS (Keep It Simple, Stupid)."

---

# Vibecoding Stack Recommendations
- **IDE:** **Cursor** (with Composer mode) is the current king of "Vibecoding." It allows you to describe changes across files much like we do here.
- **Agent Orchestration:** Use **Claude 3.5 Sonnet** (via Cursor or Claude Code) for coding reasoning, and **Gemini 1.5 Pro** for handling long-context documents/PDFs like your schematics.
- **Data:** **Firestore** is essential for that 'instant sync' feel without writing a custom WebSocket server.
- **Workflow:** 
  1. Write the core logic in one file first (The Kimi approach).
  2. Once it 'vibes', refactor into components.
  3. Continuous testing on actual hardware (Phone) is critical for Mic/Audio bugs.
