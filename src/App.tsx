import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, Mic, MicOff, Download, Globe, History, X, Languages, 
  Beaker, Share2, Trash2, Edit2, Check, Plus, LogIn, User as UserIcon,
  BookOpen, ChevronUp, ChevronDown
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, updateDoc, deleteDoc, setDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// --- CONFIG & UTILS ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const STT_MODEL = "gemini-3-flash-preview"; 
const TRANSLATE_MODEL = "gemini-3.1-pro-preview"; 

interface Message {
  id: string;
  en: string;
  ru: string;
  sourceLang: 'en' | 'ru';
  timestamp: any;
  userId: string;
  userName: string;
}

interface DictionaryEntry {
  word: string;
  translation: string;
  definition: string;
  examples: string[];
  grammar?: string;
}

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [activeLang, setActiveLang] = useState<'en' | 'ru'>('en');
  const [selectedWord, setSelectedWord] = useState<DictionaryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRefEn = useRef<HTMLDivElement>(null);
  const scrollRefRu = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    [scrollRefEn, scrollRefRu].forEach(ref => {
      if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth' });
    });
  }, [messages]);

  // 1. Session & Auth Management
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('session');
    if (id) setSessionId(id);

    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !user) return;
    const q = query(collection(db, 'sessions', sessionId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (err) => {
      console.error("Firestore snapshot error:", err);
      if (err.message.includes('permission')) {
        setError("Missing permissions. Make sure you're logged in.");
      }
    });
  }, [sessionId, user]);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      return result.user;
    } catch (err) {
      setError("Login failed. Check internet/popups.");
      return null;
    }
  };

  const createSession = async () => {
    setIsLoading(true);
    let currentUser = user || await login();
    if (!currentUser) { setIsLoading(false); return; }

    const id = Math.random().toString(36).substring(2, 10);
    const ref = doc(db, 'sessions', id);
    await setDoc(ref, { id, createdAt: serverTimestamp(), createdBy: currentUser.uid, name: `Session ${id}` });
    
    const url = new URL(window.location.href);
    url.searchParams.set('session', id);
    window.history.pushState({}, '', url.toString());
    setSessionId(id);
    setIsLoading(false);
  };

  // 2. Audio Processing (8s Chunks)
  useEffect(() => {
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let interval: any = null;

    const startRecording = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const recordChunk = () => {
          if (!isRecording) return;
          const chunkRecorder = new MediaRecorder(stream!, { mimeType: 'audio/webm' });
          const chunks: Blob[] = [];

          chunkRecorder.ondataavailable = (e) => chunks.push(e.data);
          chunkRecorder.onstop = async () => {
            if (chunks.length === 0) return;
            const blob = new Blob(chunks, { type: 'audio/webm' });
            if (blob.size < 1000) return;

            processAudio(blob);
          };

          chunkRecorder.start();
          setStatus('listening');
          setTimeout(() => {
            if (chunkRecorder.state !== 'inactive') chunkRecorder.stop();
          }, 8000); // 8 second chunks
        };

        recordChunk();
        interval = setInterval(recordChunk, 8500);
      } catch (err) {
        setError("Mic denied. Open in a NEW TAB if in iframe.");
        setIsRecording(false);
      }
    };

    if (isRecording) startRecording();

    return () => {
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isRecording]);

  const processAudio = async (blob: Blob) => {
    setStatus('processing');
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await genAI.models.generateContent({
          model: STT_MODEL,
          contents: {
            parts: [
              { text: `Transcribe speech verbatim. Context: Medical Engineering (UTAH/Moscow). Language: ${activeLang === 'en' ? 'English' : 'Russian'}. 
           Return transcription only. If silence, return [SILENCE].` },
              { inlineData: { mimeType: "audio/webm", data: base64 } }
            ]
          }
        });

        const text = result.text?.trim();
        if (text && text !== "[SILENCE]" && text.toLowerCase() !== "silence") {
          handleLogic(text);
        }
        setStatus(isRecording ? 'listening' : 'idle');
      };
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  // 3. Translation & Persistence
  const handleLogic = async (text: string, manualSource?: 'en' | 'ru') => {
    if (!sessionId || !user) return;
    const source = manualSource || activeLang;
    
    try {
      const prompt = `Act as an expert Medical Interpreter (RU/EN). 
      Translate the following precisely for a research context.
      STRICT: Maintain logical polarity (negatives stay negative).
      Input (${source}): "${text}"
      
      Return JSON: { "originalCleaned": "...", "translated": "..." }`;

      const result = await genAI.models.generateContent({
        model: TRANSLATE_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      const data = JSON.parse(result.text || "{}");
      
      await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
        en: (source === 'en' ? data.originalCleaned : data.translated) || "",
        ru: (source === 'ru' ? data.originalCleaned : data.translated) || "",
        sourceLang: source,
        timestamp: serverTimestamp(),
        userId: user.uid,
        userName: user.displayName || 'Guest'
      });
    } catch (err) {
      setError("AI Engine busy. Try shorter sentences.");
    }
  };

  // 4. Dictionary
  const lookup = async (word: string) => {
    setSelectedWord({ word, translation: 'Searching...', definition: '', examples: [] });
    try {
      const prompt = `Medical Dictionary entry for "${word}". Context: Bioengineering. Return JSON.`;
      const result = await genAI.models.generateContent({
        model: TRANSLATE_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setSelectedWord(JSON.parse(result.text || "{}"));
    } catch (err) {
      setSelectedWord(null);
    }
  };

  // UI Components
  const MessageItem = ({ m }: { m: Message }) => {
    const isEditing = false; // Simple version for now
    return (
      <div className="group space-y-1 py-4 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-zinc-600 mb-1">
          <span>{m.userName}</span>
          <span className="w-1 h-1 rounded-full bg-zinc-800" />
          <span>{m.timestamp?.toDate?.().toLocaleTimeString() || '...'}</span>
        </div>
        
        {/* Top/Bottom display based on preference, but here we show both for sync */}
        <div className="space-y-3">
          {/* Partner Zone (Top-feeling) */}
          <div className="text-amber-500 font-medium text-lg lg:text-xl leading-snug">
            {m.ru.split(' ').map((w, i) => (
              <span key={i} onClick={() => lookup(w.replace(/\W/g, ''))} className="cursor-pointer hover:underline mr-1">{w}</span>
            ))}
          </div>
          {/* User Zone (Bottom-feeling) */}
          <div className="text-zinc-300 font-light text-base lg:text-lg">
             {m.en.split(' ').map((w, i) => (
              <span key={i} onClick={() => lookup(w.replace(/\W/g, ''))} className="cursor-pointer hover:underline mr-1">{w}</span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#080808] text-white overflow-hidden selection:bg-amber-500/30">
      
      {/* Header */}
      <header className="p-4 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center font-serif font-bold text-black italic">H</div>
          <div>
            <h1 className="text-xs font-black uppercase tracking-widest text-zinc-100">Hypatia</h1>
            <p className="text-[9px] text-zinc-500 uppercase font-mono tracking-tighter">InterpreterPro 1.0b</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {error && <div className="text-[10px] text-red-500 font-bold px-3 py-1 bg-red-500/10 rounded-full animate-pulse">{error}</div>}
          {sessionId && (
            <button 
              onClick={() => { navigator.clipboard.writeText(window.location.href); }}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <Share2 size={18} />
            </button>
          )}
          {user ? (
            <img src={user.photoURL!} className="w-7 h-7 rounded-full border border-white/10" alt="me" />
          ) : (
            <button onClick={login} className="text-[10px] font-bold text-zinc-400 border border-white/10 px-3 py-1 rounded-full">LOGIN</button>
          )}
        </div>
      </header>

      {/* Split Horizon Content */}
      <main className="flex-1 flex flex-col relative min-h-0 bg-black">
        {!sessionId ? (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
            <div className="max-w-xs w-full text-center space-y-6">
              <Globe className="mx-auto text-amber-500" size={48} />
              <h2 className="text-2xl font-serif italic font-light">Secure Session</h2>
              <p className="text-zinc-500 text-[11px] leading-relaxed">Join a shared live transcript for medical engineering precision.</p>
              <button 
                onClick={createSession} 
                disabled={isLoading}
                className="w-full py-4 bg-white text-black font-black uppercase text-xs rounded-2xl tracking-widest hover:bg-amber-400 transition-colors"
              >
                {isLoading ? 'INITIATING...' : 'New Session'}
              </button>
            </div>
          </div>
        ) : !authLoaded ? (
          <div className="absolute inset-0 z-40 bg-black flex items-center justify-center">
            <div className="text-zinc-500 text-xs font-mono tracking-widest uppercase animate-pulse">Initializing Secure Connection...</div>
          </div>
        ) : !user ? (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-xl flex items-center justify-center p-8">
            <div className="max-w-xs w-full text-center space-y-6">
              <LogIn className="mx-auto text-amber-500" size={48} />
              <h2 className="text-2xl font-serif italic font-light">Join Session</h2>
              <p className="text-zinc-500 text-[11px] leading-relaxed">Please authenticate to join this secure medical session.</p>
              <button 
                onClick={login} 
                className="w-full py-4 bg-white text-black font-black uppercase text-xs rounded-2xl tracking-widest hover:bg-amber-400 transition-colors"
              >
                Sign In to Join
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Zone: Russian */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#0a0a0a] border-b border-white/5">
              <div className="text-[9px] font-black uppercase text-zinc-600 mb-6 tracking-widest flex items-center gap-2">
                <Globe size={10} /> <span>Live Russian Feed</span>
              </div>
              <div className="space-y-6">
                {messages.map(m => (
                  <div key={m.id} className="group">
                    <div className="text-amber-500 font-medium text-lg lg:text-2xl leading-relaxed">
                      {m.ru.split(' ').map((w, i) => (
                        <span key={i} onClick={() => lookup(w.replace(/\W/g, ''))} className="cursor-pointer hover:underline mr-1">{w}</span>
                      ))}
                    </div>
                    <div className="text-[8px] text-zinc-700 font-bold uppercase mt-1">
                      {m.userName} • {m.timestamp?.toDate?.().toLocaleTimeString() || '...'}
                    </div>
                  </div>
                ))}
                <div ref={scrollRefRu} />
              </div>
            </div>

            {/* Bottom Zone: English */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-black">
              <div className="text-[9px] font-black uppercase text-zinc-600 mb-6 tracking-widest flex items-center gap-2">
                <Languages size={10} /> <span>Live English Feed</span>
              </div>
              <div className="space-y-6">
                {messages.map(m => (
                  <div key={m.id} className="group">
                    <div className="text-zinc-200 font-light text-base lg:text-xl leading-relaxed">
                      {m.en.split(' ').map((w, i) => (
                        <span key={i} onClick={() => lookup(w.replace(/\W/g, ''))} className="cursor-pointer hover:underline mr-1">{w}</span>
                      ))}
                    </div>
                    <div className="text-[8px] text-zinc-700 font-bold uppercase mt-1">
                      {m.userName} • {m.timestamp?.toDate?.().toLocaleTimeString() || '...'}
                    </div>
                  </div>
                ))}
                <div ref={scrollRefEn} />
              </div>
            </div>
          </div>
        )}

        {/* Status Overlay */}
        {status !== 'idle' && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 z-40">
            <div className={`w-2 h-2 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-amber-500 animate-bounce'}`} />
            <span className="text-[9px] font-black uppercase text-zinc-300 tracking-[0.2em]">{status}...</span>
          </div>
        )}
      </main>

      {/* Control Footer */}
      <footer className="p-4 bg-[#0a0a0a] border-t border-white/5 flex flex-col gap-4 pb-[env(safe-area-inset-bottom,1rem)]">
        <div className="flex gap-2 w-full max-w-2xl mx-auto items-center">
          <input 
            placeholder={`Type ${activeLang === 'en' ? 'English' : 'Russian'} manual entry...`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleLogic((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
            className="flex-1 bg-zinc-900 border-none text-xs px-4 py-3 rounded-xl focus:ring-1 focus:ring-amber-500 text-zinc-300"
          />
          <div className="flex bg-zinc-800 rounded-xl p-1 border border-white/5">
            <button onClick={() => setActiveLang('en')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${activeLang === 'en' ? 'bg-amber-500 text-black shadow-lg' : 'text-zinc-500'}`}>EN</button>
            <button onClick={() => setActiveLang('ru')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${activeLang === 'ru' ? 'bg-amber-500 text-black shadow-lg' : 'text-zinc-500'}`}>RU</button>
          </div>
          <button 
            onClick={() => setIsRecording(!isRecording)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-2xl ${isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-white text-black hover:rotate-6 active:scale-90'}`}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>
      </footer>

      {/* Dictionary Drawer */}
      <AnimatePresence>
        {selectedWord && (
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            className="fixed inset-0 z-[100] flex flex-col justify-end pointer-events-none"
          >
            <div className="bg-[#111] border-t border-white/10 rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] pointer-events-auto max-w-2xl mx-auto w-full">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 text-amber-500 font-black text-[10px] uppercase">
                  <BookOpen size={14} /> <span>Clinical Glossary</span>
                </div>
                <button onClick={() => setSelectedWord(null)} className="p-2 text-zinc-500 hover:text-white"><X size={24} /></button>
              </div>
              <h2 className="text-4xl font-serif italic mb-2">{selectedWord.word}</h2>
              <div className="text-amber-500 text-xs font-black uppercase mb-6 tracking-widest">{selectedWord.translation}</div>
              <p className="text-zinc-400 text-lg font-light leading-relaxed italic mb-8 border-l border-amber-500/30 pl-6">
                {selectedWord.definition || "Consulting medical database..."}
              </p>
              {selectedWord.examples?.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[9px] uppercase font-black text-zinc-600 tracking-widest">In Situ Application</h4>
                  {selectedWord.examples.map((ex, i) => (
                    <div key={i} className="text-xs text-zinc-500 bg-white/5 p-4 rounded-xl border border-white/5">{ex}</div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
