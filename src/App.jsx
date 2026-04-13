import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Settings, Download, Search,
  Clock, Flame, BarChart2, Calendar, Target, X, LogOut
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import { signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, provider } from './firebase'; 

/* ─── Design tokens ───────────────────────────────────────────────── */
const C = {
  bg0:    '#0f0f13', bg1:    '#1a1a22', bg2:    '#15151e', bg3:    '#111118',
  border: '#2e2e3a', border2:'#3b3b52', text:   '#e8e6f0', muted:  '#8888a0', dim:    '#6b6b80',
  accent: 'linear-gradient(135deg,#4f6ef7,#7c5cfc)', red:    'linear-gradient(135deg,#f74f6e,#c44444)',
  green:  'linear-gradient(90deg,#4caf50,#66bb6a)', blue:   'linear-gradient(90deg,#4f6ef7,#7c5cfc)',
  amber:  'linear-gradient(90deg,#ffb300,#ff8f00)',
};

/* ─── Style helpers ───────────────────────────────────────────────── */
const card = (extra = {}) => ({ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 20, padding: '20px 22px', ...extra });
const fieldInput = { width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const modalBtn = (bg, color, border) => ({ flex: 1, padding: '10px', borderRadius: 10, background: bg, color, border: border || 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' });

/* ─── Constants ───────────────────────────────────────────────────── */
const STORAGE = { persona: 'ojt_persona', totalGoal: 'ojt_total_goal', dailyGoal: 'ojt_daily_goal' };
const DEFAULT_PERSONA = { name: 'My OJT', role: 'Internship tracker' };
const MOODS = [
  { key: 'good', label: 'productive', bg: '#1a2e1a', border: '#4caf50', color: '#81c784' },
  { key: 'ok',   label: 'neutral',    bg: '#2e2a1a', border: '#ffb300', color: '#ffd54f' },
  { key: 'hard', label: 'rough day',  bg: '#2e1a1a', border: '#f44336', color: '#e57373' },
];
const ACTIVITY_TAGS = ['coding', 'meetings', 'research', 'design', 'docs'];
const MOOD_DOT = { good: '#4caf50', ok: '#ffb300', hard: '#f44336' };

function pad(n) { return String(n).padStart(2, '0'); }
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function getLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

function ProgBar({ pct, done, style = {} }) {
  return (
    <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: 'hidden', ...style }}>
      <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, pct)}%`, background: done ? C.green : C.blue, transition: 'width .5s ease' }} />
    </div>
  );
}

function Tag({ label, active, bg, border, color, onClick }) {
  return <button onClick={onClick} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, fontFamily: 'inherit', border: `1px solid ${active ? border : C.border}`, background: active ? bg : 'transparent', color: active ? color : C.dim, cursor: 'pointer', fontWeight: active ? 600 : 400 }}>{label}</button>;
}

function IconBtn({ onClick, title, children }) {
  return <button onClick={onClick} title={title} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 8px', cursor: 'pointer', color: C.dim, display: 'flex', alignItems: 'center' }}>{children}</button>;
}

/* ─── Main component ──────────────────────────────────────────────── */
export default function App() {
  // --- AUTHENTICATION STATE ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- APP STATE ---
  const [logs, setLogs]             = useState([]); 
  const [persona, setPersona]       = useState(() => getLocal(STORAGE.persona, DEFAULT_PERSONA));
  const [totalGoal, setTotalGoal]   = useState(() => parseFloat(getLocal(STORAGE.totalGoal, 317)));
  const [dailyGoal, setDailyGoal]   = useState(() => parseFloat(getLocal(STORAGE.dailyGoal, 8)));
  const [tracking, setTracking]     = useState(false);
  const [startTime, setStartTime]   = useState(null);
  const [elapsed, setElapsed]       = useState(0);
  const [mood, setMood]             = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [note, setNote]             = useState('');
  const [tab, setTab]               = useState('sessions');
  const [search, setSearch]         = useState('');
  const [editEntry, setEditEntry]   = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(DEFAULT_PERSONA);
  const timerRef = useRef(null);

  // --- 1. AUTHENTICATION LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

// --- 2. FIREBASE SYNC EFFECT ---
  useEffect(() => {
    // Only fetch logs if the user is logged in. Just exit if not!
    if (!user) return;

    const q = query(collection(db, 'logs'), orderBy('ts', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(firestoreLogs);
    });
    return () => unsubscribe();
  }, [user]);

  // --- LOCAL PERSISTENCE ---
  useEffect(() => { localStorage.setItem(STORAGE.persona, JSON.stringify(persona)); }, [persona]);
  useEffect(() => { localStorage.setItem(STORAGE.totalGoal, totalGoal); }, [totalGoal]);
  useEffect(() => { localStorage.setItem(STORAGE.dailyGoal, dailyGoal); }, [dailyGoal]);

  useEffect(() => {
    if (tracking && startTime) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [tracking, startTime]);

  /* Stats */
  const totalHrs = logs.reduce((a, l) => a + l.duration, 0);
  const todayStr = new Date().toLocaleDateString();
  const todayHrs = logs.filter(l => l.date === todayStr).reduce((a, l) => a + l.duration, 0);
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; })();
  const weekHrs = logs.filter(l => new Date(l.ts || 0) >= weekStart).reduce((a, l) => a + l.duration, 0);
  const totalPct = Math.min(100, (totalHrs / totalGoal) * 100);
  const dailyPct = Math.min(100, (todayHrs / dailyGoal) * 100);

  function calcStreak() {
    if (!logs.length) return 0;
    const dates = [...new Set(logs.map(l => l.date))].map(d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }).sort((a, b) => b - a);
    let streak = 0, cur = new Date(); cur.setHours(0, 0, 0, 0);
    for (const d of dates) { if ((cur - d) / 86400000 <= 1) { streak++; cur = d; } else break; }
    return streak;
  }
  const streak = calcStreak();

  // --- ACTIONS ---
const handleLogin = async () => {
    try { 
      // Use Redirect instead of Popup for mobile compatibility!
      await signInWithRedirect(auth, provider); 
    } 
    catch (error) { 
      console.error("Login failed:", error); 
      alert("Login Error: " + error.message); // This will show us if Firebase is mad!
    }
  };

const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await signOut(auth);
      setLogs([]); // <--- Safely wipe the screen data here!
      setShowSettings(false);
    }
  };

  async function toggleTimer() {
    if (!tracking) {
      const now = Date.now();
      setStartTime(now); setElapsed(0); setTracking(true);
    } else {
      const end = Date.now();
      const duration = parseFloat(((end - startTime) / 3600000).toFixed(2));
      
      const newEntry = {
        userId: user.uid, // Tie this log to your account!
        date: new Date(startTime).toLocaleDateString(),
        start: new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        end: new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration, note, mood, tags: [...activeTags], ts: startTime,
      };

      try {
        await addDoc(collection(db, 'logs'), newEntry);
      } catch (e) {
        console.error("Error saving to Firebase:", e);
        alert("Failed to save to cloud.");
      }

      setTracking(false); setStartTime(null); setElapsed(0); setMood(''); setActiveTags([]); setNote('');
    }
  }

  function toggleTag(tag) { setActiveTags(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag]); }

  async function saveEdit() {
    try {
      const logRef = doc(db, 'logs', editEntry.id);
      await updateDoc(logRef, { date: editEntry.date, start: editEntry.start, end: editEntry.end, duration: parseFloat(editEntry.duration), note: editEntry.note });
      setEditEntry(null);
    } catch (e) { console.error("Error updating document: ", e); }
  }

  async function deleteEntry(id) {
    if (!window.confirm('Delete this session from the cloud?')) return;
    try { await deleteDoc(doc(db, 'logs', id)); setEditEntry(null); } 
    catch (e) { console.error("Error deleting document: ", e); }
  }

  function exportCSV() {
    const rows = [['Date','Start','End','Hours','Mood','Tags','Note'], ...logs.map(l => [l.date,l.start,l.end,l.duration,l.mood||'',(l.tags||[]).join(';'),l.note||''])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'ojt_hours.csv'; a.click();
  }
  
  function saveSettings() { setPersona(settingsForm); setShowSettings(false); }
  function clearAll() {
    if (!window.confirm('Clear local settings? (Cloud logs will NOT be deleted)')) return;
    Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
    setPersona(DEFAULT_PERSONA); setTotalGoal(317); setDailyGoal(8); setShowSettings(false);
  }

  const filtered = logs.filter(l => { const q = search.toLowerCase(); return !q || (l.note||'').toLowerCase().includes(q) || (l.date||'').includes(q) || (l.tags||[]).join(' ').toLowerCase().includes(q); });

  const heatData = (() => {
    const dayMap = {};
    logs.forEach(l => { const k = new Date(l.ts || 0).toLocaleDateString(); dayMap[k] = (dayMap[k] || 0) + l.duration; });
    const maxH = Math.max(1, ...Object.values(dayMap));
    const today = new Date(); today.setHours(0, 0, 0, 0); const start = new Date(today); start.setDate(today.getDate() - 27);
    const cells = []; for (let i = 0; i < start.getDay(); i++) cells.push(null);
    for (let i = 0; i < 28; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push({ date: d.toLocaleDateString(), hrs: dayMap[d.toLocaleDateString()] || 0 }); }
    return { cells, maxH };
  })();

  /* ─── AUTHENTICATION GUARD ─── */
  if (authLoading) return <div style={{ height: '100vh', background: C.bg0 }} />; // Blank screen while loading

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ ...card(), width: '100%', maxWidth: 340, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ background: C.bg2, width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: `1px solid ${C.border}` }}>
            <Clock size={30} color="#4f6ef7" />
          </div>
          <h1 style={{ color: C.text, fontSize: 24, margin: '0 0 8px 0' }}>OJT Tracker</h1>
          <p style={{ color: C.dim, fontSize: 14, margin: '0 0 30px 0' }}>Securely log your internship hours.</p>
          
          <button onClick={handleLogin} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'white', color: 'black', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit' }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  /* ─── Render Dashboard ─────────────────────────────────────────── */
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet" />
      <div style={{ minHeight: '100vh', background: C.bg0, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Header card ── */}
          <div style={{ ...card(), background: 'linear-gradient(135deg,#1e1e2e 0%,#1a1a22 100%)', border: `1px solid ${C.border2}` }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{persona.name}</div>
                <div style={{ fontSize: 13, color: C.dim, display:'flex', alignItems:'center', gap: 5, marginTop: 3 }}><Clock size={12} color={C.dim} /> {persona.role}</div>
              </div>
              <IconBtn onClick={() => { setSettingsForm(persona); setShowSettings(true); }} title="Settings"><Settings size={15} /></IconBtn>
            </div>
            <ProgBar pct={totalPct} done={totalPct >= 100} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop: 3 }}>
              <span style={{ fontSize: 11, color: C.dim }}>{totalHrs.toFixed(1)} / {totalGoal} hrs</span>
              <span style={{ fontSize: 11, color: C.dim }}>{totalPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* ── Timer card ── */}
          <div style={card()}>
            <div style={{ fontSize: 46, fontWeight: 700, textAlign: 'center', letterSpacing: 4, fontVariantNumeric: 'tabular-nums', padding: '8px 0 16px', fontFamily: "'DM Mono','Fira Mono',monospace" }}>{fmtElapsed(elapsed)}</div>
            {tracking && <>
              <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: C.dim, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 6 }}>mood</div><div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>{MOODS.map(m => <Tag key={m.key} label={m.label} active={mood === m.key} bg={m.bg} border={m.border} color={m.color} onClick={() => setMood(m.key)} />)}</div></div>
              <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: C.dim, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 6 }}>activity</div><div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>{ACTIVITY_TAGS.map(tag => <Tag key={tag} label={tag} active={activeTags.includes(tag)} bg="#1a1e2e" border="#4f6ef7" color="#8aadff" onClick={() => toggleTag(tag)} />)}</div></div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="what are you working on? (optional)" style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 60, boxSizing: 'border-box', marginBottom: 12 }} />
            </>}
            <button onClick={toggleTimer} style={{ width: '100%', padding: '16px', borderRadius: 14, fontSize: 16, fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: tracking ? C.red : C.accent }}>{tracking ? <><Square size={18} /> Time Out</> : <><Play size={18} /> Time In</>}</button>
            {tracking && startTime && <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 8 }}>started at {new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
          </div>

          {/* ── Stats grid ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
            {[ { label:'total hours', val: totalHrs.toFixed(1), icon: <Clock size={13} color={C.dim} /> }, { label:'this week', val: weekHrs.toFixed(1) + ' hrs', icon: <BarChart2 size={13} color={C.dim} /> }, { label:'sessions', val: logs.length, icon: <Target size={13} color={C.dim} /> }, { label:'streak', val: `${streak} 🔥`, icon: <Flame size={13} color={C.dim} /> } ].map(s => (
              <div key={s.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 11, color: C.dim, letterSpacing:'0.06em', textTransform:'uppercase', display:'flex', alignItems:'center', gap: 4, marginBottom: 6 }}>{s.icon}{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs card ── */}
          <div style={card()}>
            <div style={{ display:'flex', gap: 4, background: C.bg3, borderRadius: 12, padding: 4, marginBottom: 16 }}>
              {[ { key:'sessions', icon:<Clock size={12}/>, label:'sessions' }, { key:'heatmap', icon:<Calendar size={12}/>, label:'heatmap' }, { key:'goals', icon:<Target size={12}/>, label:'goals' } ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '7px 4px', borderRadius: 9, fontSize: 12, fontFamily: 'inherit', fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', background: tab === t.key ? '#1e1e2e' : 'transparent', color: tab === t.key ? '#b0acf0' : C.dim, border: tab === t.key ? `1px solid ${C.border2}` : '1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', gap: 5 }}>{t.icon} {t.label}</button>
              ))}
            </div>

            {tab === 'sessions' && <>
              <div style={{ display:'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, display:'flex', alignItems:'center', gap: 8, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 12px' }}>
                  <Search size={13} color={C.dim} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: C.text, fontFamily: 'inherit' }} />
                </div>
                <IconBtn onClick={exportCSV} title="Export CSV"><Download size={15} /></IconBtn>
              </div>
              {filtered.length === 0 && <div style={{ fontSize: 13, color: C.dim, textAlign:'center', padding:'24px 0' }}>no sessions yet</div>}
              {filtered.map(l => (
                <button key={l.id} onClick={() => setEditEntry({ ...l })} style={{ display:'flex', alignItems:'flex-start', gap: 12, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8, cursor:'pointer', background:'transparent', width:'100%', textAlign:'left', fontFamily: 'inherit', color: C.text }} onMouseEnter={e => e.currentTarget.style.background='#1e1e28'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: l.mood ? MOOD_DOT[l.mood] : '#4f6ef7' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 2 }}><span style={{ fontSize: 11, color: C.dim }}>{l.date}</span><span style={{ fontWeight: 600, fontSize: 14 }}>{l.duration} hrs</span></div>
                    <div style={{ fontSize: 13, color: C.muted }}>{l.start} – {l.end}</div>
                    {l.note && <div style={{ fontSize: 12, color: C.dim, marginTop: 2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.note}</div>}
                    {l.tags?.length > 0 && <div style={{ display:'flex', gap: 4, flexWrap:'wrap', marginTop: 6 }}>{l.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: C.border, color: C.muted }}>{t}</span>)}</div>}
                  </div>
                </button>
              ))}
            </>}

            {tab === 'heatmap' && <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>last 28 days — darker = more hours</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>{['S','M','T','W','T','F','S'].map((d, i) => <span key={i} style={{ textAlign:'center', fontSize: 10, color: C.dim }}>{d}</span>)}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 3 }}>
                {heatData.cells.map((c, i) => <div key={i} title={c ? `${c.date}: ${c.hrs.toFixed(1)}h` : ''} style={{ aspectRatio: '1', borderRadius: 4, background: c && c.hrs > 0 ? `rgba(79,110,247,${Math.max(0.2, c.hrs / heatData.maxH)})` : '#1e1e28' }} />)}
              </div>
            </>}

            {tab === 'goals' && (
              <div style={{ display:'flex', flexDirection:'column', gap: 20 }}>
                {[ { label:'total OJT goal (hours)', val: totalGoal, set: setTotalGoal, min:1, max:2000, step:1, fallback:317, pct:totalPct, done:totalPct>=100, cur:totalHrs, unit:'hrs', prog: C.blue }, { label:'daily hour goal', val: dailyGoal, set: setDailyGoal, min:0.5, max:12, step:0.5, fallback:8, pct:dailyPct, done:dailyPct>=100, cur:todayHrs, unit:'hrs today', prog: C.amber } ].map(g => (
                  <div key={g.label}>
                    <label style={{ fontSize: 11, color: C.dim, display:'block', marginBottom: 4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{g.label}</label>
                    <input type="number" min={g.min} max={g.max} step={g.step} value={g.val} onChange={e => g.set(parseFloat(e.target.value) || g.fallback)} style={fieldInput} />
                    <div style={{ height: 6, borderRadius: 4, background: C.border, overflow:'hidden', margin:'8px 0 4px' }}><div style={{ height:'100%', borderRadius:4, width:`${g.pct}%`, background: g.done ? C.green : g.prog, transition:'width .5s' }} /></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize: 11, color: C.dim }}>{g.cur.toFixed(1)} / {g.val} {g.unit}</span><span style={{ fontSize: 11, color: C.dim }}>{g.pct.toFixed(0)}%</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Edit modal ── */}
        {editEntry && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }} onClick={() => setEditEntry(null)}>
            <div style={{ background: C.bg1, border:`1px solid ${C.border2}`, borderRadius:20, padding:24, width:'100%', maxWidth:380 }} onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}><span style={{ fontWeight:700, fontSize:16 }}>edit session</span><IconBtn onClick={() => setEditEntry(null)}><X size={15}/></IconBtn></div>
              {[{label:'date',key:'date',type:'text'},{label:'start',key:'start',type:'text'}, {label:'end',key:'end',type:'text'},{label:'hours',key:'duration',type:'number'}].map(f => (
                <div key={f.key}><label style={{ fontSize:11, color:C.dim, display:'block', marginBottom:4, marginTop:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label><input type={f.type} step={f.type==='number'?'0.01':undefined} value={editEntry[f.key]} onChange={e => setEditEntry(p => ({...p,[f.key]: f.type==='number'?parseFloat(e.target.value):e.target.value}))} style={fieldInput} /></div>
              ))}
              <label style={{ fontSize:11, color:C.dim, display:'block', marginBottom:4, marginTop:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>note</label>
              <textarea value={editEntry.note||''} onChange={e => setEditEntry(p=>({...p,note:e.target.value}))} style={{ ...fieldInput, resize:'vertical', minHeight:60 }} />
              <div style={{ display:'flex', gap:8, marginTop:16 }}><button onClick={saveEdit} style={modalBtn('linear-gradient(135deg,#4f6ef7,#7c5cfc)','#fff')}>save</button><button onClick={() => deleteEntry(editEntry.id)} style={modalBtn('#2a1515','#f74f6e',`1px solid #4a2020`)}>delete</button><button onClick={() => setEditEntry(null)} style={modalBtn(C.bg3,C.muted,`1px solid ${C.border}`)}>cancel</button></div>
            </div>
          </div>
        )}

        {/* ── Settings modal ── */}
        {showSettings && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }} onClick={() => setShowSettings(false)}>
            <div style={{ background: C.bg1, border:`1px solid ${C.border2}`, borderRadius:20, padding:24, width:'100%', maxWidth:380 }} onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}><span style={{ fontWeight:700, fontSize:16 }}>settings</span><IconBtn onClick={() => setShowSettings(false)}><X size={15}/></IconBtn></div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:12, background:C.bg3, borderRadius:12 }}>
                <img src={user.photoURL} alt="Profile" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{user.displayName}</div><div style={{ fontSize: 11, color: C.dim }}>{user.email}</div></div>
                <button onClick={handleLogout} style={{ background:'transparent', border:'none', color:C.muted, cursor:'pointer' }}><LogOut size={16} /></button>
              </div>
              {[{label:'your name / persona',key:'name',ph:'e.g. Alex'},{label:'role / company',key:'role',ph:'e.g. Dev Intern at Acme'}].map(f => (
                <div key={f.key}><label style={{ fontSize:11, color:C.dim, display:'block', marginBottom:4, marginTop:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</label><input type="text" placeholder={f.ph} value={settingsForm[f.key]} onChange={e => setSettingsForm(p=>({...p,[f.key]:e.target.value}))} style={fieldInput} /></div>
              ))}
              <div style={{ display:'flex', gap:8, marginTop:20 }}><button onClick={saveSettings} style={modalBtn('linear-gradient(135deg,#4f6ef7,#7c5cfc)','#fff')}>save</button><button onClick={clearAll} style={modalBtn('#2a1515','#f74f6e',`1px solid #4a2020`)}>clear local</button></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}