import { useState, useRef, useEffect, useCallback } from "react";

// Use relative URLs - Vite proxy will forward to backend
const API_URL = "/api/chat";
const HEALTH_URL = "/api/health";

// How many times to retry a failed request (for cold start)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 8000; // 8 seconds between retries

function generateSessionId() {
  return "session_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
}

const LANG_QUICK_REPLIES = ["🇬🇧 English", "🇮🇳 हिंदी में बात करें"];
const POST_LANG_EN = [
  "Teacher recruitment",
  "School registration fees",
  "How does placement work?",
  "I'm a teacher looking for a job",
];
const POST_LANG_HI = [
  "शिक्षक भर्ती",
  "स्कूल शुल्क जानकारी",
  "प्लेसमेंट कैसे होती है?",
  "मुझे नौकरी चाहिए",
];

// Server status: 'checking' | 'online' | 'waking' | 'offline'
export default function MaaSavitriChatPage() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Namaste! 🙏 Welcome to Maa Savitri Consultancy Services.\n\nPlease select your preferred language:\n🇬🇧 English  |  🇮🇳 हिंदी",
      time: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [quickReplies, setQuickReplies] = useState(LANG_QUICK_REPLIES);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [language, setLanguage] = useState(null);
  const [serverStatus, setServerStatus] = useState("checking"); // checking | online | waking | offline
  const [retryCount, setRetryCount] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const retryTimerRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Wake up server on page load ──────────────────────────────
  useEffect(() => {
    let attempts = 0;
    const MAX_WAKE_ATTEMPTS = 10;

    const ping = async () => {
      try {
        const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          setServerStatus("online");
          return;
        }
      } catch {
        // still waking
      }
      attempts++;
      if (attempts < MAX_WAKE_ATTEMPTS) {
        setServerStatus("waking");
        setTimeout(ping, 6000);
      } else {
        setServerStatus("offline");
      }
    };

    ping();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (serverStatus === "online") inputRef.current?.focus();
  }, [serverStatus]);

  // ── Countdown timer for retry banner ─────────────────────────
  const startCountdown = useCallback((seconds) => {
    setRetrySeconds(seconds);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setRetrySeconds((s) => {
        if (s <= 1) { clearInterval(countdownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    clearTimeout(retryTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  // ── Core send with auto-retry ─────────────────────────────────
  const sendMessage = async (text, attempt = 0) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    // Language detection
    if (!language) {
      if (messageText.includes("English") || messageText.includes("🇬🇧")) {
        setLanguage("en");
        setQuickReplies(POST_LANG_EN);
      } else if (messageText.includes("हिंदी") || messageText.includes("🇮🇳")) {
        setLanguage("hi");
        setQuickReplies(POST_LANG_HI);
      }
    }

    if (attempt === 0) {
      setInput("");
      setShowQuickReplies(false);
      setRetryCount(0);
      setMessages((prev) => [...prev, { role: "user", text: messageText, time: new Date() }]);
    }

    setIsLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, sessionId }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.reply) throw new Error("No reply");

      setServerStatus("online");
      setRetryCount(0);
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply, time: new Date() }]);
      setShowQuickReplies(true);
      setIsLoading(false);

    } catch (err) {
      const is429 = err?.message?.includes("429");

      if (is429) {
        // Rate limit — wait 65s then auto-retry once
        const waitSec = 65;
        setRetryCount(1);
        setServerStatus("waking");
        startCountdown(waitSec);
        retryTimerRef.current = setTimeout(() => {
          sendMessage(messageText, MAX_RETRIES); // skip straight to last attempt
        }, waitSec * 1000);
      } else if (attempt < MAX_RETRIES) {
        const nextAttempt = attempt + 1;
        setRetryCount(nextAttempt);
        setServerStatus("waking");
        startCountdown(RETRY_DELAY_MS / 1000);
        retryTimerRef.current = setTimeout(() => {
          sendMessage(messageText, nextAttempt);
        }, RETRY_DELAY_MS);
      } else {
        setIsLoading(false);
        setRetryCount(0);
        setServerStatus("offline");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: language === "hi"
              ? "माफ़ करें, सर्वर अभी उपलब्ध नहीं है। कृपया कुछ देर बाद पुनः प्रयास करें।"
              : "Sorry, the server is taking too long to respond. Please wait a moment and try again — it may be waking up from sleep.",
            time: new Date(),
            isError: true,
          },
        ]);
        setShowQuickReplies(true);
      }
    }
  };

  const handleNewChat = () => {
    clearTimeout(retryTimerRef.current);
    clearInterval(countdownRef.current);
    setMessages([{
      role: "assistant",
      text: "Namaste! 🙏 Welcome to Maa Savitri Consultancy Services.\n\nPlease select your preferred language:\n🇬🇧 English  |  🇮🇳 हिंदी",
      time: new Date(),
    }]);
    setInput("");
    setLanguage(null);
    setQuickReplies(LANG_QUICK_REPLIES);
    setShowQuickReplies(true);
    setRetryCount(0);
    setIsLoading(false);
  };

  const fmt = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const isInputDisabled = isLoading || serverStatus === "checking" || serverStatus === "waking";

  // ── Status banner content ─────────────────────────────────────
  const StatusBanner = () => {
    if (serverStatus === "online") return null;

    const bannerConfig = {
      checking: {
        bg: "#fff8e1", border: "#f39c12", color: "#7d5a00",
        dot: "#f39c12",
        text: "Connecting to server...",
      },
      waking: {
        bg: "#fff3cd", border: "#f0ad4e", color: "#7d5a00",
        dot: "#f39c12",
        text: retryCount > 0
          ? `Rate limit reached — retrying in ${retrySeconds}s...`
          : "Server is waking up from sleep. Please wait (~30 sec)...",
      },
      offline: {
        bg: "#fdecea", border: "#e74c3c", color: "#a93226",
        dot: "#e74c3c",
        text: "Server offline. Check your Render dashboard or try refreshing.",
      },
    };

    const cfg = bannerConfig[serverStatus];
    if (!cfg) return null;

    return (
      <div style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "8px",
        padding: "9px 14px",
        margin: "10px 24px 0",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12.5px",
        color: cfg.color,
        maxWidth: "780px",
        alignSelf: "center",
        width: "calc(100% - 48px)",
      }}>
        {/* Pulsing dot */}
        <span style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: cfg.dot, flexShrink: 0,
          animation: serverStatus !== "offline" ? "pulse 1.5s infinite" : "none",
        }} />
        {cfg.text}
        {serverStatus === "offline" && (
          <button
            onClick={() => { setServerStatus("checking"); window.location.reload(); }}
            style={{ marginLeft: "auto", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "5px", padding: "3px 10px", fontSize: "11px", cursor: "pointer" }}
          >
            Retry
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%", fontFamily: "'Segoe UI', Tahoma, sans-serif", background: "#eaf0f6", overflow: "hidden" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .msg-in{animation:fadeUp 0.2s ease}
        .d1{animation:bounce 1.2s infinite 0s}
        .d2{animation:bounce 1.2s infinite 0.2s}
        .d3{animation:bounce 1.2s infinite 0.4s}
        .qbtn:hover{background:#d0e8f5!important;border-color:#5dade2!important}
        .sbtn:hover:not(:disabled){background:#154360!important}
        .ncbtn:hover{background:rgba(255,255,255,0.2)!important}
        .ifield:focus{border-color:#1a5276!important;background:#fff!important;outline:none}
        .svc-btn:hover{background:#e8f4fc!important}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#ccd6dd;border-radius:10px}
        @media(max-width:640px){.sidebar{display:none!important}}
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "#1a5276", padding: "0 20px", height: "62px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#f39c12", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "13px", color: "#fff", flexShrink: 0 }}>MS</div>
          <div>
            <div style={{ color: "#fff", fontWeight: "600", fontSize: "15px", lineHeight: 1.3 }}>Maa Savitri Consultancy Services</div>
            <div style={{ color: "#a9cce3", fontSize: "11px", display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%", display: "inline-block",
                background: serverStatus === "online" ? "#2ecc71" : serverStatus === "offline" ? "#e74c3c" : "#f39c12",
                animation: serverStatus === "waking" || serverStatus === "checking" ? "pulse 1.5s infinite" : "none",
              }} />
              {serverStatus === "online" ? "AI Assistant · Siwan, Bihar"
                : serverStatus === "waking" ? "Server waking up..."
                : serverStatus === "checking" ? "Connecting..."
                : "Server offline"}
            </div>
          </div>
        </div>
        <button className="ncbtn" onClick={handleNewChat} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: "8px", padding: "7px 14px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Chat
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div className="sidebar" style={{ width: "255px", background: "#fff", borderRight: "1px solid #dde3ea", display: "flex", flexDirection: "column", flexShrink: 0, padding: "18px 14px", gap: "10px", overflowY: "auto" }}>
          <div style={{ fontSize: "10.5px", fontWeight: "700", color: "#95a5a6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Our Services</div>
          {[
            { icon: "👨‍🏫", label: "Teacher Recruitment", desc: "Qualified educators for schools" },
            { icon: "🏫", label: "School Staffing", desc: "Non-teaching staff placement" },
            { icon: "📢", label: "Admission Campaigns", desc: "Boost student enrollment" },
            { icon: "🌐", label: "Website Designing", desc: "Professional school websites" },
            { icon: "📣", label: "Advertising & Promotion", desc: "Brand your institution" },
          ].map((s) => (
            <button key={s.label} className="svc-btn" onClick={() => sendMessage(s.label)} disabled={isInputDisabled} style={{ background: "none", border: "1px solid #eaecee", borderRadius: "10px", padding: "10px 11px", cursor: isInputDisabled ? "not-allowed" : "pointer", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", transition: "background 0.15s", opacity: isInputDisabled ? 0.5 : 1 }}>
              <span style={{ fontSize: "20px", lineHeight: 1.1, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#1a5276" }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: "#95a5a6", marginTop: "2px" }}>{s.desc}</div>
              </div>
            </button>
          ))}
          <div style={{ marginTop: "auto", background: "#f0f7fc", borderRadius: "10px", padding: "12px", border: "1px solid #d4e6f1" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#1a5276", marginBottom: "6px" }}>📍 Contact Us</div>
            <div style={{ fontSize: "12px", color: "#5d6d7e", lineHeight: "1.8" }}>
              Siwan, Bihar<br />Serving Bihar &amp; Eastern UP
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f4f8fb" }}>

          {/* Status Banner */}
          <StatusBanner />

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 8px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ maxWidth: "780px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>
              {messages.map((msg, i) => (
                <div key={i} className="msg-in" style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: "3px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0, background: msg.role === "user" ? "#2980b9" : "#f39c12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", color: "#fff" }}>
                      {msg.role === "user" ? "U" : "MS"}
                    </div>
                    <div style={{ maxWidth: "68%", padding: "11px 15px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "#1a5276" : msg.isError ? "#fdecea" : "#ffffff", color: msg.role === "user" ? "#fff" : msg.isError ? "#c0392b" : "#2c3e50", fontSize: "14px", lineHeight: "1.65", border: msg.role === "assistant" && !msg.isError ? "1px solid #dde3ea" : "none", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", whiteSpace: "pre-wrap" }}>
                      {msg.text}
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", color: "#aab4be", paddingLeft: msg.role === "user" ? 0 : "40px", paddingRight: msg.role === "user" ? "40px" : 0 }}>
                    {fmt(msg.time)}
                  </div>
                </div>
              ))}

              {/* Typing / Retrying indicator */}
              {isLoading && (
                <div className="msg-in" style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f39c12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", color: "#fff", flexShrink: 0 }}>MS</div>
                  <div style={{ padding: "11px 15px", background: "#fff", borderRadius: "18px 18px 18px 4px", border: "1px solid #dde3ea", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", minWidth: "120px" }}>
                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                      {["d1","d2","d3"].map(c => <div key={c} className={c} style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#95a5a6" }} />)}
                    </div>
                    {retryCount > 0 && (
                      <div style={{ fontSize: "11px", color: "#e67e22" }}>
                        ⏳ Rate limit — retrying in {retrySeconds}s...
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Quick Replies */}
          {showQuickReplies && quickReplies.length > 0 && !isLoading && (
            <div style={{ padding: "8px 24px", display: "flex", flexWrap: "wrap", gap: "8px", background: "#f4f8fb" }}>
              <div style={{ maxWidth: "780px", width: "100%", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {quickReplies.map((qr) => (
                  <button key={qr} className="qbtn" onClick={() => sendMessage(qr)} disabled={isInputDisabled} style={{ background: "#eaf4fc", border: "1px solid #aed6f1", color: "#1a5276", borderRadius: "20px", padding: "7px 15px", fontSize: "13px", cursor: isInputDisabled ? "not-allowed" : "pointer", fontWeight: "500", transition: "all 0.15s", opacity: isInputDisabled ? 0.5 : 1 }}>
                    {qr}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div style={{ padding: "12px 24px 14px", background: "#fff", borderTop: "1px solid #dde3ea" }}>
            <div style={{ maxWidth: "780px", margin: "0 auto", display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                ref={inputRef}
                className="ifield"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !isInputDisabled && sendMessage()}
                placeholder={
                  serverStatus === "checking" ? "Connecting to server..." :
                  serverStatus === "waking" ? "Server waking up, please wait..." :
                  serverStatus === "offline" ? "Server offline — please refresh" :
                  language === "hi" ? "अपना संदेश लिखें..." : "Type your message here..."
                }
                disabled={isInputDisabled}
                style={{ flex: 1, border: "1.5px solid #d5dbdb", borderRadius: "25px", padding: "11px 18px", fontSize: "14px", color: "#2c3e50", background: isInputDisabled ? "#f0f0f0" : "#f7f9fb", transition: "border-color 0.2s, background 0.2s", cursor: isInputDisabled ? "not-allowed" : "text" }}
              />
              <button
                className="sbtn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isInputDisabled}
                style={{ width: "46px", height: "46px", borderRadius: "50%", background: !input.trim() || isInputDisabled ? "#bdc3c7" : "#1a5276", border: "none", cursor: !input.trim() || isInputDisabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", padding: "6px 0 8px", fontSize: "11px", color: "#aab4be", background: "#fff", borderTop: "1px solid #f0f0f0" }}>
            Maa Savitri Consultancy Services · Siwan, Bihar · Powered by AI
          </div>
        </div>
      </div>
    </div>
  );
}