import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { FaTelegramPlane } from "react-icons/fa";
import { Bell, Bot, Camera, Check, CheckCheck, Cpu, Home, Lightbulb, ListTodo, LogOut, Mail, MessageCircle, Mic, MicOff, Moon, Music, Paperclip, PhoneCall, Plus, Radio, Rocket, Search, Send, Settings, Smile, Sparkles, Sun, UserRound, Volume2, Wand2, Zap, } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { socket } from "../socket.js";
import gsap from "gsap";
import * as THREE from "three";
import AvatarCanvas from "./components/AvatarCanvas";
import { useOneTimeAlerts } from "./hooks/useOneTimeAlerts";
import { useOsStore } from "./stores/useOsStore";
const AUTH_EXPIRED_EVENT = "nanna-auth-expired";
const getSocketUrl = () => import.meta.env.VITE_API_URL || (window.location.port === "5173" ? "http://localhost:5000" : undefined);
import * as faceapi from "face-api.js";
const colors = {
    bg: "#05070d",
    panel: "rgba(10, 14, 24, 0.74)",
    panelStrong: "rgba(14, 20, 34, 0.88)",
    glass: "rgba(255,255,255,0.072)",
    line: "rgba(255,255,255,0.13)",
    lineStrong: "rgba(255,255,255,0.2)",
    text: "#f8fbff",
    muted: "#98a5ba",
    soft: "#d7e1f4",
    cyan: "#50e6ff",
    mint: "#7cf2c3",
    pink: "#ff7ab8",
    amber: "#ffd36a",
    danger: "#ff667f",
    violet: "#9a8cff",
};
const styles = {
    app: {
        minHeight: "100vh",
        color: colors.text,
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: "radial-gradient(circle at 12% 8%, rgba(80,230,255,0.18), transparent 24%), radial-gradient(circle at 78% 6%, rgba(154,140,255,0.16), transparent 22%), radial-gradient(circle at 88% 78%, rgba(124,242,195,0.12), transparent 26%), linear-gradient(135deg, #05070d 0%, #101827 48%, #060811 100%)",
    },
    shell: {
        width: "min(1500px, calc(100% - 28px))",
        margin: "0 auto",
        padding: "18px 0",
    },
    card: {
        background: colors.panel,
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        boxShadow: "0 24px 80px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(22px)",
    },
    input: {
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${colors.line}`,
        background: "rgba(255,255,255,0.075)",
        color: colors.text,
        borderRadius: 8,
        padding: "12px 13px",
        outline: "none",
        fontSize: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    button: {
        border: 0,
        borderRadius: 8,
        color: colors.text,
        background: "linear-gradient(135deg, #27d8ff, #8f83ff 54%, #ff7ab8)",
        padding: "11px 14px",
        fontWeight: 850,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 42,
    },
    ghostButton: {
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        color: colors.soft,
        background: "rgba(255,255,255,0.07)",
        padding: "10px 12px",
        fontWeight: 800,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 40,
    },
    label: {
        display: "grid",
        gap: 7,
        color: colors.muted,
        fontSize: 12,
        fontWeight: 850,
        textTransform: "uppercase",
        letterSpacing: 0,
    },
};
const apiRequest = async (path, options = {}, token) => {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });
    const data = (await response.json().catch(() => ({})));
    if (response.status === 401) {
        localStorage.removeItem("nanna_token");
        localStorage.removeItem("nanna_user");
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        throw new Error("Session expired. Please log in again.");
    }
    if (!response.ok)
        throw new Error(data.message || "Request failed");
    return data;
};
const uploadToServer = async (file, token) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });
    const data = (await response.json().catch(() => ({})));
    if (!response.ok || !data.file) {
        throw new Error(data.message || "Upload failed");
    }
    return data.file;
};
const formatFileSize = (bytes) => {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const useViewport = () => {
    const [width, setWidth] = useState(window.innerWidth);
    useEffect(() => {
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return { isMobile: width < 760, isTablet: width < 1040 };
};
const toIso = (value) => (value ? new Date(value).toISOString() : undefined);
const formatDate = (value) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "No date";
const getSavedUser = () => {
    const saved = localStorage.getItem("nanna_user");
    if (!saved)
        return null;
    try {
        return JSON.parse(saved);
    }
    catch {
        localStorage.removeItem("nanna_user");
        localStorage.removeItem("nanna_token");
        return null;
    }
};
// Enhanced wake word detection - more reliable matching
const hasWakeWord = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    // Match various wake word patterns
    return /\b(hi|hey|hello|ok|okay)\s+nanna\b/i.test(lower) ||
           /\bnanna\b/i.test(lower) ||
           /\bnana\b/i.test(lower) ||  // Common misrecognition
           /\bnana ai\b/i.test(lower);
};

// Clean wake word from command - more thorough cleaning
const cleanWakeCommand = (text) => {
    if (!text) return "";
    return text
        .replace(/\b(hi|hey|hello|ok|okay)\s+nanna\b[,\s:]*/gi, "")
        .replace(/\bnanna\s+ai\b[,\s:]*/gi, "")
        .replace(/\bnanna\b[,\s:]*/gi, "")
        .replace(/\bnana\b[,\s:]*/gi, "")
        .replace(/\s+/g, " ")
        .trim();
};
const speak = (text, style, events = {}) => {
    if (!("speechSynthesis" in window)) {
        events.onEnd?.();
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.rate = style === "female" ? 0.96 : style === "male" ? 0.9 : 0.94;
    utterance.pitch = style === "female" ? 1.22 : style === "male" ? 0.86 : 1.05;
    utterance.onstart = () => events.onStart?.();
    utterance.onend = () => events.onEnd?.();
    utterance.onerror = () => events.onEnd?.();
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((voice) => style === "female"
        ? /female|zira|susan|samantha|aria|jenny|google uk english female|en-in/i.test(voice.name)
        : style === "male"
            ? /male|david|mark|daniel|ravi|google uk english male/i.test(voice.name)
            : /english|en-/i.test(voice.lang));
    if (preferred)
        utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
};
const AuthScreen = ({ onAuth }) => {
    const { isTablet } = useViewport();
    const [mode, setMode] = useState("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const submit = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const data = await apiRequest(`/api/auth/${mode === "register" ? "register" : "login"}`, {
                method: "POST",
                body: JSON.stringify(mode === "register" ? { name, email, phone, password } : { email, password }),
            });
            onAuth(data.token, data.user);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to continue");
        }
        finally {
            setLoading(false);
        }
    };
    return (<main style={{ ...styles.app, display: "grid", placeItems: "center", padding: 18 }}>
      <section style={{
            width: "min(1120px, 100%)",
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "1.15fr 0.85fr",
            gap: 18,
        }}>
        <div style={{
            ...styles.card,
            padding: 28,
            minHeight: 520,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
        }}>
          <div>
            <Brand />
            <p style={{ color: colors.soft, fontSize: 19, lineHeight: 1.65, maxWidth: 720 }}>
              A browser-based voice assistant foundation with wake word, speech-to-text,
              human-like text-to-speech, smart-home controls, routines, skills, and memory.
            </p>
          </div>
          <FeatureGrid />
        </div>

        <form onSubmit={submit} style={{ ...styles.card, padding: 24, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["login", "register"].map((item) => (<button key={item} type="button" onClick={() => setMode(item)} style={{ ...(mode === item ? styles.button : styles.ghostButton), flex: 1 }}>
                {item === "login" ? "Login" : "Register"}
              </button>))}
          </div>
          {mode === "register" && (<>
              <Field label="Name" value={name} onChange={setName} placeholder="Your name"/>
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="+91..."/>
            </>)}
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com"/>
          <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" type="password"/>
          {error && <Alert>{error}</Alert>}
          <button type="submit" style={styles.button} disabled={loading}>
            <Sparkles size={18}/>
            {loading ? "Connecting..." : mode === "login" ? "Enter NANNA" : "Create account"}
          </button>
        </form>
      </section>
    </main>);
};
const App = () => {
    const { isMobile, isTablet } = useViewport();
    const theme = useOsStore((state) => state.theme);
    const toggleTheme = useOsStore((state) => state.toggleTheme);
    const [booting, setBooting] = useState(true);
    const [token, setToken] = useState(() => localStorage.getItem("nanna_token"));
    const [user, setUser] = useState(getSavedUser);
    const [screen, setScreen] = useState("assistant");
    const [tasks, setTasks] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [devices, setDevices] = useState([]);
    const [skills, setSkills] = useState([]);
    const [routines, setRoutines] = useState([]);
    const [alarms, setAlarms] = useState([]);
    const [automationJobs, setAutomationJobs] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [integrations, setIntegrations] = useState(null);
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState("");
    const [voiceStyle, setVoiceStyle] = useState("female");
    const [incomingAlerts, setIncomingAlerts] = useState([]);
    const refreshQueuedRef = useRef(false);
const stats = useMemo(() => ({
    tasks: (tasks || []).filter(
        task => task.status === "pending"
    ).length,

    reminders: (reminders || []).filter(
        reminder => reminder.status === "scheduled"
    ).length,

   devices: (devices || [])
  .filter(device => device?.state?.power)
  .length,

    skills: (skills || []).filter(
        skill => skill.enabled
    ).length,

    automations: (automationJobs || []).filter(
        job =>
            job.status === "queued" ||
            job.status === "processing"
    ).length,

    alerts: (notifications || []).filter(
        notification => notification.status === "unread"
    ).length,
}), [tasks, reminders, devices, skills, automationJobs, notifications]);
    const saveAuth = (nextToken, nextUser) => {
        localStorage.setItem("nanna_token", nextToken);
        localStorage.setItem("nanna_user", JSON.stringify(nextUser));
        setToken(nextToken);
        setUser(nextUser);
    };
    const logout = () => {
        localStorage.removeItem("nanna_token");
        localStorage.removeItem("nanna_user");
        setToken(null);
        setUser(null);
    };
    const loadDashboard = async () => {
        if (!token)
            return;
        try {
            const profileData = await apiRequest("/api/users/profile", {}, token);
            const [taskData, reminderData, deviceData, skillData, routineData, alarmData, historyData, automationData, notificationData, integrationData,] = await Promise.all([
                apiRequest("/api/tasks", {}, token),
                apiRequest("/api/reminders", {}, token),
                apiRequest("/api/devices", {}, token),
                apiRequest("/api/skills", {}, token),
                apiRequest("/api/routines", {}, token),
                apiRequest("/api/alarms", {}, token),
                apiRequest("/api/ai/history", {}, token),
                apiRequest("/api/automation/jobs", {}, token),
                apiRequest("/api/automation/notifications", {}, token),
                apiRequest("/api/automation/integrations", {}, token),
            ]);
            setTasks(taskData.tasks || []);
            setReminders(reminderData.reminders || []);
            setDevices(deviceData.devices || []);
            setSkills(skillData.skills || []);
            setRoutines(routineData.routines);
            setAlarms(alarmData.alarms || []);
            setAutomationJobs(automationData.jobs || []);
            setNotifications(notificationData.notifications || []);
            setIntegrations(integrationData.integrations || {});
            setMessages(historyData.messages || []);
            setUser(profileData.user);
            localStorage.setItem("nanna_user", JSON.stringify(profileData.user));
        }
        catch (err) {
            if (err instanceof Error && err.message.includes("Session expired")) {
                setToken(null);
                setUser(null);
            }
            setStatus(err instanceof Error ? err.message : "Unable to load NANNA data");
        }
    };
    useEffect(() => {
        loadDashboard();
    }, [token]);
    useEffect(() => {
        if (!token)
            return;
        const socket = io(getSocketUrl(), {
            auth: { token },
            transports: ["websocket", "polling"],
        });
        const refreshNow = () => {
            if (refreshQueuedRef.current)
                return;
            refreshQueuedRef.current = true;
            window.setTimeout(async () => {
                try {
                    await loadDashboard();
                }
                finally {
                    refreshQueuedRef.current = false;
                }
            }, 120);
        };
        socket.on("connect", () => setStatus(""));
        socket.on("connect_error", () => setStatus("Live updates disconnected. Reconnecting..."));
        socket.on("dashboard:changed", refreshNow);
        return () => socket.disconnect();
    }, [token]);
    const markNotificationRead = useCallback(async (notificationId) => {
        const data = await apiRequest(`/api/automation/notifications/${notificationId}/read`, { method: "PUT" }, token);
        setNotifications((items) => items.map((item) => item._id === data.notification._id ? data.notification : item));
    }, [token]);
    const openCommunicationAlerts = useCallback((items = incomingAlerts) => {
        setScreen("assistant");
        setIncomingAlerts([]);
        if (items.length) {
            Promise.all(items.map((item) => markNotificationRead(item._id))).catch(() => undefined);
        }
    }, [incomingAlerts, markNotificationRead]);
    const dismissIncomingAlerts = useCallback(() => {
        const items = incomingAlerts;
        setIncomingAlerts([]);
        if (items.length) {
            Promise.all(items.map((item) => markNotificationRead(item._id))).catch(() => undefined);
        }
    }, [incomingAlerts, markNotificationRead]);
    useOneTimeAlerts({
        token,
        notifications,
        markNotificationRead,
        onIncomingAlert: setIncomingAlerts,
    });
    useEffect(() => {
        const onExpired = () => {
            setToken(null);
            setUser(null);
            setStatus("Session expired. Please log in again.");
        };
        window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(() => setBooting(false), 2200);
        return () => window.clearTimeout(timer);
    }, []);
    if (!token || !user)
        return <AuthScreen onAuth={saveAuth}/>;
    return (<main className="nanna-os" data-theme={theme}>
      <AmbientParticles />
      <AnimatePresence>{booting && <BootScreen />}</AnimatePresence>
      <TelegramIncomingPopup alerts={incomingAlerts} onOpen={() => openCommunicationAlerts(incomingAlerts)} onDismiss={dismissIncomingAlerts}/>
      <div className="life-shell">
        <header className="os-glass os-topbar" style={{
            gridTemplateColumns: isMobile ? "minmax(0, 1fr) auto" : "auto minmax(0, 1fr) auto",
        }}>
          <Brand compact/>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: colors.muted, fontSize: 12, fontWeight: 850 }}>
              WAKE WORD: "NANNA"
            </div>
            <h1 style={{ margin: "2px 0 0", fontSize: isMobile ? 20 : 25 }}>
              Voice Assistant Console
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isMobile && (<div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 850 }}>{user.name}</div>
                <div style={{ color: colors.muted, fontSize: 13 }}>{user.email}</div>
              </div>)}
            <button type="button" onClick={toggleTheme} className="theme-toggle" title="Toggle dark/light mode">
              {theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button type="button" onClick={logout} style={styles.ghostButton} title="Logout">
              <LogOut size={18}/>
            </button>
          </div>
        </header>

        <section className="os-grid" style={{
            gridTemplateColumns: isTablet ? "1fr" : "260px minmax(0, 1fr)",
        }}>
          <aside className="os-glass os-sidebar" style={{
            display: isTablet ? "grid" : "block",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)",
            gap: isTablet ? 8 : 0,
        }}>
            <NavItem active={screen === "assistant"} icon={<Radio size={18}/>} label="Assistant" onClick={() => setScreen("assistant")}/>
            <NavItem active={screen === "devices"} icon={<Lightbulb size={18}/>} label="Devices" onClick={() => setScreen("devices")}/>
            <NavItem active={screen === "skills"} icon={<Wand2 size={18}/>} label="Skills" onClick={() => setScreen("skills")}/>
            <NavItem active={screen === "routines"} icon={<Zap size={18}/>} label="Routines" onClick={() => setScreen("routines")}/>
            <NavItem active={screen === "productivity"} icon={<ListTodo size={18}/>} label="Productivity" onClick={() => setScreen("productivity")}/>
            <NavItem active={screen === "profile"} icon={<Settings size={18}/>} label="Profile" onClick={() => setScreen("profile")}/>
            <div style={{
            borderTop: `1px solid ${colors.line}`,
            marginTop: 12,
            paddingTop: 12,
            display: "grid",
            gap: 10,
            gridColumn: isTablet ? "1 / -1" : undefined,
        }}>
              <StatCard label="Pending tasks" value={stats.tasks} tone={colors.cyan}/>
              <StatCard label="Devices on" value={stats.devices} tone={colors.mint}/>
              <StatCard label="AI jobs" value={stats.automations} tone={colors.pink}/>
              <StatCard label="Reminders" value={stats.reminders} tone={colors.amber}/>
              <StatCard label="Alerts" value={stats.alerts} tone={colors.danger}/>
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            {status && <Alert>{status}</Alert>}
            {screen === "assistant" && (<AssistantPanel token={token} messages={messages} setMessages={setMessages} refresh={loadDashboard} voiceStyle={voiceStyle} setVoiceStyle={setVoiceStyle} jobs={automationJobs} notifications={notifications} integrations={integrations} devices={devices} reminders={reminders} user={user}/>)}
            {screen === "devices" && (<DevicesPanel token={token} devices={devices} setDevices={setDevices}/>)}
            {screen === "skills" && (<SkillsPanel token={token} skills={skills} setSkills={setSkills}/>)}
            {screen === "routines" && (<RoutinesPanel token={token} routines={routines} devices={devices} refresh={loadDashboard}/>)}
            {screen === "productivity" && (<ProductivityPanel token={token} tasks={tasks} setTasks={setTasks} reminders={reminders} setReminders={setReminders} alarms={alarms} setAlarms={setAlarms}/>)}
            {screen === "profile" && (<ProfilePanel token={token} user={user} onUserChange={saveAuth}/>)}
          </section>
        </section>
      </div>
    </main>);
};
const TelegramIncomingPopup = ({ alerts = [], onOpen, onDismiss }) => {
    if (!alerts.length)
        return null;
    const latest = alerts[0];
    const title = latest.title || "Telegram message";
    const body = latest.body || "New incoming message";
    const sender = latest.metadata?.telegramUser?.displayName || latest.metadata?.telegramUser?.username || latest.metadata?.from || "Telegram";
    return (<motion.div initial={{ opacity: 0, y: -18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} style={{
            position: "fixed",
            top: 18,
            right: 18,
            zIndex: 80,
            width: "min(390px, calc(100vw - 28px))",
            border: "1px solid rgba(42, 171, 238, 0.38)",
            borderRadius: 8,
            background: "linear-gradient(145deg, rgba(12, 22, 34, 0.98), rgba(6, 12, 20, 0.96))",
            boxShadow: "0 22px 70px rgba(0,0,0,0.46)",
            padding: 14,
            backdropFilter: "blur(18px)",
        }}>
      <div style={{ display: "grid", gridTemplateColumns: "42px minmax(0, 1fr)", gap: 12 }}>
        <div style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "#2aabee",
            color: "#fff",
        }}>
          <FaTelegramPlane size={22}/>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
            <span style={{ color: colors.muted, fontSize: 12 }}>{alerts.length > 1 ? `${alerts.length} new` : "now"}</span>
          </div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 2, overflowWrap: "anywhere" }}>From {sender}</div>
          <div style={{ color: colors.text, marginTop: 8, lineHeight: 1.45, overflowWrap: "anywhere" }}>{body}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onDismiss} style={{ ...styles.ghostButton, minHeight: 34, padding: "7px 10px" }}>Dismiss</button>
        <button type="button" onClick={onOpen} style={{ ...styles.button, minHeight: 34, padding: "7px 11px" }}>Open</button>
      </div>
    </motion.div>);
};
const AssistantPanel = ({ token, messages, setMessages, refresh, voiceStyle, setVoiceStyle, jobs, notifications, integrations, devices, reminders, user, }) => {
    const { isTablet } = useViewport();
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [listening, setListening] = useState(false);
    const [wakeMode, setWakeMode] = useState(false);
    const [muted, setMuted] = useState(false);
    const [voiceStatus, setVoiceStatus] = useState("Voice idle");
    const [speaking, setSpeaking] = useState(false);
    const [spokenText, setSpokenText] = useState("");
    const recognitionRef = useRef(null);
    const wakeModeRef = useRef(false);
    const suppressWakeRestartRef = useRef(false);
    const inputRef = useRef(null);
    const messageScrollRef = useRef(null);
    const speakWithAvatar = (text) => {
        if (muted)
            return;
        setSpokenText(text);
        setVoiceStatus("NANNA is speaking...");
        speak(text, voiceStyle, {
            onStart: () => setSpeaking(true),
            onEnd: () => {
                setSpeaking(false);
                setVoiceStatus(wakeModeRef.current ? 'Listening for "Nanna"...' : "Voice idle");
            },
        });
    };
    const sendText = async (text) => {
        if (!text.trim())
            return;
        const userMessage = { role: "user", content: text };
        setMessages((prev) => [...prev, userMessage]);
        setMessage("");
        setLoading(true);
        try {
            const data = await apiRequest("/api/ai/chat", { method: "POST", body: JSON.stringify({ message: text }) }, token);
            const assistantMessage = { role: "assistant", content: data.reply, intent: data.intent.name };
            setMessages((prev) => [...prev, assistantMessage]);
            const mediaPayload = data.action?.job?.payload;
            if (mediaPayload?.module === "media") {
                window.dispatchEvent(new CustomEvent("nanna-media-command", { detail: mediaPayload }));
            }
            speakWithAvatar(data.reply);
            await refresh();
        }
        finally {
            setLoading(false);
        }
    };
    const submit = (event) => {
        event.preventDefault();
        sendText(message);
    };
    const quickLaunch = (prompt) => {
        setMessage(prompt);
        window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    useEffect(() => {
        const container = messageScrollRef.current;
        if (!container)
            return;
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }, [messages]);
    const startVoice = (wakeOnly) => {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
            setVoiceStatus("Speech recognition is not supported in this browser. Use Chrome or Edge.");
            return;
        }
        recognitionRef.current?.abort();
        const recognition = new Recognition();
        recognition.continuous = wakeOnly;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
            const latestResult = event.results[event.results.length - 1];
            const latest = latestResult?.[0]?.transcript || "";
            const transcript = latest.trim();
            if (!transcript)
                return;
            if (!latestResult.isFinal) {
                setVoiceStatus(wakeOnly ? `Hearing: ${transcript}` : `Listening: ${transcript}`);
                return;
            }
            if (wakeOnly) {
                if (hasWakeWord(transcript)) {
                    setVoiceStatus("NANNA heard. Listening for your command...");
                    speakWithAvatar("Yes?");
                    suppressWakeRestartRef.current = true;
                    recognition.stop();
                    window.setTimeout(() => {
                        if (wakeModeRef.current)
                            startVoice(false);
                    }, 450);
                }
                else {
                    setVoiceStatus(`Listening for wake word. Heard: ${transcript}`);
                }
            }
            else {
                const cleanedCommand = cleanWakeCommand(transcript);
                const command = cleanedCommand || transcript;
                if (hasWakeWord(transcript) && !cleanedCommand) {
                    setVoiceStatus("NANNA heard. Tell me your command.");
                    speakWithAvatar("Yes?");
                    window.setTimeout(() => startVoice(false), 450);
                    return;
                }
                setMessage(command);
                setVoiceStatus(`Working on: ${command}`);
                speakWithAvatar("On it.");
                sendText(command);
            }
        };
        recognition.onend = () => {
            setListening(false);
            if (wakeModeRef.current && wakeOnly) {
                if (suppressWakeRestartRef.current) {
                    suppressWakeRestartRef.current = false;
                    return;
                }
                try {
                    recognition.start();
                    setListening(true);
                }
                catch {
                    setVoiceStatus("Wake listener paused. Tap wake mode again.");
                }
            }
            else if (wakeModeRef.current && !wakeOnly) {
                window.setTimeout(() => {
                    if (wakeModeRef.current)
                        startVoice(true);
                }, 700);
            }
        };
        recognition.onerror = () => setVoiceStatus("Microphone error. Check browser permission.");
        recognitionRef.current = recognition;
        if (wakeOnly) {
            wakeModeRef.current = true;
            setWakeMode(true);
        }
        setListening(true);
        setVoiceStatus(wakeOnly ? 'Wake on. Say "Nanna" to start a command.' : "Listening for your command...");
        if (!wakeOnly)
            speakWithAvatar("I'm listening.");
        recognition.start();
    };
    const stopVoice = () => {
        wakeModeRef.current = false;
        suppressWakeRestartRef.current = false;
        setWakeMode(false);
        setListening(false);
        recognitionRef.current?.stop();
        setVoiceStatus("Voice stopped");
    };
    const recentAction = jobs[0]?.type || "ready";
    const unreadAlerts = notifications.filter((item) => item.status === "unread").length;
    const assistantReady = true;
    const assistantStatusLabel = assistantReady ? "Live" : "Starting...";
    const telegramReady = integrations?.telegram?.healthy === true;
    const telegramStatusLabel = integrations?.telegram?.healthy === true
        ? "ready"
        : integrations?.telegram?.configured
            ? "token issue"
            : "setup";
    const avatarMood = loading
        ? "thinking"
        : speaking
            ? "speaking"
            : listening
                ? "listening"
                : muted
                    ? "idle"
                    : "ready";
    const messageTime = () => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
    return (<motion.div className="copilot-stage" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
      <motion.div className="os-glass ai-orb-panel alexa-panel" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
        <div className="copilot-meta">
          <PanelTitle icon={<Bot size={21}/>} title="NANNA Voice" subtitle="Alexa-style voice command center for your AI Life OS."/>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusPill label="Mode" value={wakeMode ? "Wake listening" : "Manual"} tone={wakeMode ? colors.mint : colors.cyan}/>
            <StatusPill label="Latest" value={String(recentAction)} tone={colors.violet}/>
            <StatusPill label="Alerts" value={String(unreadAlerts)} tone={unreadAlerts ? colors.danger : colors.mint}/>
            <StatusPill label="Telegram" value={telegramStatusLabel} tone={telegramReady ? "#2aabee" : colors.amber}/>
          </div>
        </div>

        <div className={`orb-wrap alexa-core ${avatarMood}`}>
          <div className="alexa-aura">
            <NannaAvatar3D mood={avatarMood} isSpeaking={speaking} speechText={spokenText}/>
          </div>
        </div>

        <div className="copilot-voice-panel">
          <div className="alexa-status-line" style={{ color: listening ? colors.mint : colors.soft }}>
            <span className="alexa-dot"/>
            {voiceStatus}
          </div>
          <div className="waveform">
            {Array.from({ length: 36 }, (_, index) => (<span key={index} style={{ animationDelay: `${index * 0.045}s` }}/>))}
          </div>
          <div className="voice-controls">
            <button type="button" onClick={() => (wakeMode ? stopVoice() : startVoice(true))} style={wakeMode ? styles.button : styles.ghostButton}>
              <Radio size={18}/>
              {wakeMode ? "Wake On" : "Wake"}
            </button>
            <button type="button" onClick={() => startVoice(false)} style={styles.ghostButton}>
              <Mic size={18}/>
              Command
            </button>
            <button type="button" onClick={() => setMuted(!muted)} style={muted ? styles.button : styles.ghostButton}>
              {muted ? <MicOff size={18}/> : <Volume2 size={18}/>}
              {muted ? "Muted" : "Voice"}
            </button>
          </div>
          <div className="alexa-command-strip">
            <button type="button" onClick={() => quickLaunch("play music")}><Music size={15}/> Music</button>
            <button type="button" onClick={() => quickLaunch("turn on the living room light")}><Lightbulb size={15}/> Home</button>
            <button type="button" onClick={() => quickLaunch("remind me to ")}><Bell size={15}/> Remind</button>
          </div>
        </div>
      </motion.div>

      <motion.div className="os-glass chat-panel telegram-panel" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
        <div className="telegram-header">
          <div className="telegram-avatar">
            <FaTelegramPlane size={24} color="#fff"/>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="telegram-title">NANNA Assistant</div>
            <div className="telegram-presence">{assistantStatusLabel}</div>
          </div>
          <div className="telegram-header-actions">
            <button type="button" onClick={() => quickLaunch("call ")} title="Call"><PhoneCall size={18}/></button>
            <button type="button" onClick={() => quickLaunch("ask ")} title="New chat"><MessageCircle size={18}/></button>
            <button type="button" onClick={() => quickLaunch("search chat ")} title="Search"><Search size={18}/></button>
          </div>
        </div>

        <div className="conversation-surface">
          <div className="telegram-feature-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 14px" }}>
            <button type="button" onClick={() => quickLaunch("")} style={{ minWidth: 100, flex: "1 1 auto" }}><Send size={15}/> Ask</button>
            <button type="button" onClick={() => startVoice(false)} style={{ minWidth: 100, flex: "1 1 auto" }}><Mic size={15}/> Voice</button>
            <button type="button" onClick={() => quickLaunch("turn on the living room light")} style={{ minWidth: 100, flex: "1 1 auto" }}><Lightbulb size={15}/> Home</button>
            <button type="button" onClick={() => quickLaunch("remind me to ")} style={{ minWidth: 120, flex: "1 1 auto" }}><Bell size={15}/> Reminder</button>
            <button type="button" onClick={() => quickLaunch("call ")} style={{ minWidth: 100, flex: "1 1 auto" }}><PhoneCall size={15}/> Call</button>
          </div>
          <div className="message-scroll" ref={messageScrollRef}>
            <div className="telegram-encrypted-note">NANNA assistant chat for questions, commands, reminders, calls, SMS, mail, and smart-home control.</div>
            {messages.length === 0 && (<EmptyState icon={<MessageCircle size={36} color="#2aabee"/>} title="Ask NANNA" text="Ask questions, speak commands, start calls, send messages, set reminders, and control smart-home devices."/>)}
            {messages.map((item, index) => (<motion.div key={`${item.role}-${index}-${item.content}`} className={`message-bubble ${item.role === "user" ? "message-user" : "message-assistant"}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28 }}>
                <div>{item.content}</div>
                <div className="message-meta">
                  {item.intent && <span>{item.intent}</span>}
                  <span>{messageTime()}</span>
                  {item.role === "user" && <CheckCheck size={14}/>}
                </div>
              </motion.div>))}
            {loading && (<div className="telegram-typing">
                <span />
                <span />
                <span />
              </div>)}
          </div>
          <div className="command-dock">
            <form onSubmit={submit} className="chat-input-row">
              <button type="button" className="chat-icon-button" onClick={() => quickLaunch("emoji ")} title="Emoji">
                <Smile size={19}/>
              </button>
              <input ref={inputRef} style={styles.input} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask NANNA anything..."/>
              <button type="button" className="chat-icon-button" onClick={() => quickLaunch("attach file to ")} title="Attach">
                <Paperclip size={19}/>
              </button>
              <button type="button" className="chat-icon-button" onClick={() => quickLaunch("send image to ")} title="Camera">
                <Camera size={19}/>
              </button>
              <button type="submit" className="telegram-send-button" disabled={loading}>
                <Send size={18}/>
              </button>
              <button type="button" className="telegram-mic-button" onClick={() => startVoice(false)} title="Voice message">
                <Mic size={18}/>
              </button>
            </form>
          </div>
        </div>
      </motion.div>

      <motion.div className="grid gap-5" style={{ gridColumn: "1 / 2" }} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }}>
        <SendNowPanel token={token} refresh={refresh} user={user} integrations={integrations} jobs={jobs} notifications={notifications}/>
        <MediaStudio />
      </motion.div>

      <motion.div className="right-column" style={{ display: "grid", gap: 20, width: "100%", gridColumn: "2 / 3" }}>
        <motion.div className="widget-stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.18 }}>
          <FloatingPanel title="Communication Apps" icon={<Cpu size={19}/>}>
            <ChannelRow label="Mail" detail={integrationDetail(integrations?.email)} status={integrationStatus(integrations?.email, jobs, "email")} tone={colors.cyan}/>
            <ChannelRow label="SMS" detail={integrationDetail(integrations?.sms)} status={integrationStatus(integrations?.sms, jobs, "sms")} tone={colors.mint}/>
            <ChannelRow label="Telegram Chat" detail={integrationDetail(integrations?.telegram)} status={integrationStatus(integrations?.telegram, jobs, "telegram")} tone={colors.amber}/>
            <ChannelRow label="Call Log" detail={integrationDetail(integrations?.call)} status={integrationStatus(integrations?.call, jobs, "call")} tone={colors.pink}/>
          </FloatingPanel>

          <FloatingPanel title="Spatial Workflow" icon={<Rocket size={19}/>}>
            <WorkflowCanvas jobs={jobs.slice(0, 5)}/>
          </FloatingPanel>

          <FloatingPanel title="Smart Surface" icon={<Home size={19}/>}>
            <div className="smart-surface">
              {devices.slice(0, 4).map((device) => (<div className="smart-tile" key={device._id}>
                  <div style={{ fontWeight: 950 }}>{device.name}</div>
                  <div style={{ color: colors.muted, fontSize: 12, margin: "4px 0 10px" }}>{device.room}</div>
                  <StatusPill label={device.type} value={device.state.power ? "on" : "off"} tone={device.state.power ? colors.mint : colors.muted}/>
                </div>))}
              {devices.length === 0 && <div style={{ color: colors.muted }}>Add smart devices to populate this surface.</div>}
            </div>
          </FloatingPanel>

          <FloatingPanel title="Memory Timeline" icon={<Sparkles size={19}/>}>
            <div className="memory-timeline">
              {(user.memory || []).slice(0, 4).map((item) => (<div key={`${item.key}-${item.value}`} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
                  <span className="memory-dot"/>
                  <div>
                    <div style={{ fontWeight: 900 }}>{item.key}</div>
                    <div style={{ color: colors.muted, fontSize: 12 }}>{item.value}</div>
                  </div>
                </div>))}
              {(user.memory || []).length === 0 && <div style={{ color: colors.muted }}>No saved memory yet.</div>}
            </div>
          </FloatingPanel>

          <FloatingPanel title="Alerts" icon={<Bell size={19}/>}>
            {notifications.length === 0 && <div style={{ color: colors.muted }}>No alerts yet.</div>}
            {notifications.slice(0, 5).map((item) => (<Row key={item._id} text={item.title} meta={`${item.channel} | ${item.status}`}/>))}
          </FloatingPanel>
        </motion.div>
      </motion.div>
    </motion.div>);
};
const SendNowPanel = ({ token, refresh, user, integrations, jobs, notifications = [], }) => {
    const fileInputRef = useRef(null);
    const recorderRef = useRef(null);
    const [channel, setChannel] = useState("email");
    const [to, setTo] = useState(user.email || user.telegramChatId || user.phone || "");
    const [subject, setSubject] = useState("NANNA message");
    const [text, setText] = useState("Hi, this is a message from NANNA.");
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordStatus, setRecordStatus] = useState("");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState("");
    const canSendAttachments = channel === "email" || channel === "telegram";
    const channelCopy = {
        email: {
            title: "Mail",
            subtitle: "Compose and send email from NANNA",
            recipient: "To",
            body: "Email Body",
            placeholder: "Write the email message...",
            status: integrations?.email?.configured ? "Mail sender connected" : "Mail setup needed",
            note: "Email messages use your configured mail provider.",
            action: "Send Email",
        },
        sms: {
            title: "SMS",
            subtitle: "Text a phone number directly",
            recipient: "Mobile Number",
            body: "Text Message",
            placeholder: "Type a short SMS...",
            status: integrations?.sms?.configured ? "SMS sender connected" : "SMS setup needed",
            note: "SMS messages are sent through your configured phone provider.",
            action: "Send SMS",
        },
        telegram: {
            title: "Telegram Chat",
            subtitle: "Send directly and receive replies in NANNA",
            recipient: "Telegram Chat ID or Phone",
            body: "Telegram Message",
            placeholder: "Type a Telegram message...",
            status: integrations?.telegram?.healthy
                ? "Direct Telegram connected"
                : integrations?.telegram?.configured
                    ? integrations?.telegram?.message || "Telegram token needs refresh"
                    : "Telegram setup needed",
            note: "Telegram can send to a chat ID or a phone number. If an unsaved number is entered, it will send as SMS fallback.",
            action: "Send Telegram",
        },
        call: {
            title: "Call Log",
            subtitle: "Start calls and keep the call request history",
            recipient: "Call Number",
            body: "Call Script",
            placeholder: "What should NANNA say on the call?",
            status: integrations?.call?.configured ? "Calling connected" : "Calling setup needed",
            note: "Calls are recorded here as call jobs with provider status.",
            action: "Start Call",
        },
    };
    const activeCopy = channelCopy[channel];
    const channelJobs = useMemo(() => jobs
        .filter((job) => job.type === channel)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 8), [jobs, channel]);
    const channelStats = useMemo(() => {
        const recent = jobs.filter((job) => job.type === channel);
        const sent = recent.filter((job) => job.status === "completed" || job.result?.status === "sent").length;
        const failed = recent.filter((job) => job.status === "failed" || job.result?.status === "failed").length;
        return { total: recent.length, sent, failed };
    }, [jobs, channel]);
    const channelTone = {
        email: colors.cyan,
        sms: colors.mint,
        telegram: "#2aabee",
        call: colors.pink,
    }[channel];
    const getSandboxIcon = (item = channel) => {
        if (item === "email") return <Mail size={18}/>;
        if (item === "sms") return <MessageCircle size={18}/>;
        if (item === "telegram") return <FaTelegramPlane size={18}/>;
        return <PhoneCall size={18}/>;
    };
    const getJobStatusLabel = (job) => {
        if (job.status === "failed" || job.result?.status === "failed") return "failed";
        if (job.status === "completed" || job.result?.status === "sent") return "sent";
        if (job.status === "processing") return "processing";
        return job.status || "queued";
    };
    const getChannelJobTitle = (job) => {
        if (channel === "email") return job.payload?.subject || "Email message";
        if (channel === "call") return `Call to ${job.payload?.to || job.result?.to || "number"}`;
        return job.payload?.text || job.payload?.message || job.result?.message || activeCopy.title;
    };
    const formatJobTime = (value) => value
        ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(value))
        : "Just now";
    const selectChannel = (nextChannel) => {
        setChannel(nextChannel);
        setTo(nextChannel === "email"
            ? user.email
            : nextChannel === "telegram"
                ? user.telegramChatId || user.phone || ""
                : user.phone || "");
        setResult("");
    };
    const addAttachments = (files) => {
        if (!files.length)
            return;
        setUploading(true);
        Promise.all(files.map((file) => uploadToServer(file, token))).then((uploaded) => {
            setAttachments((current) => [...current, ...uploaded]);
        }).catch((err) => {
            setResult(err instanceof Error ? err.message : "Upload failed.");
        }).finally(() => setUploading(false));
    };
    const handleFileInput = (event) => {
        if (!event.target.files)
            return;
        addAttachments(Array.from(event.target.files));
        event.target.value = "";
    };
    const removeAttachment = (index) => {
        setAttachments((current) => current.filter((_, idx) => idx !== index));
    };
    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setResult("Voice recording is not supported in this browser.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0)
                    chunks.push(event.data);
            };
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: "audio/webm" });
                const file = new File([blob], `nanna-voice-${Date.now()}.webm`, { type: blob.type });
                await addAttachments([file]);
                stream.getTracks().forEach((track) => track.stop());
                recorderRef.current = null;
                setRecording(false);
                setRecordStatus("Voice note attached.");
            };
            recorderRef.current = recorder;
            recorder.start();
            setRecording(true);
            setRecordStatus("Recording voice note...");
        }
        catch (error) {
            setResult(error instanceof Error ? error.message : "Unable to start recording.");
        }
    };
    const stopRecording = () => {
        if (!recorderRef.current)
            return;
        recorderRef.current.stop();
        setRecordStatus("Stopping recording...");
    };
    const sendNow = async (event) => {
        event.preventDefault();
        setResult("");
        if (["sms", "call"].includes(channel) && !to.trim()) {
            setResult("Enter a phone number in international format, for example +91 98765 43210.");
            return;
        }
        if (channel === "telegram" && !to.trim()) {
            setResult("Enter a Telegram chat ID. Open your bot once and save the chat ID shown by NANNA.");
            return;
        }
        if (channel === "email" && !to.trim()) {
            setResult("Enter an email address before sending.");
            return;
        }
        setSending(true);
        try {
            const payload = channel === "email"
                ? { to, subject, text, attachments }
                : channel === "telegram"
                    ? { to, text, attachments, mediaUrls: attachments.map((item) => item.url) }
                    : { to, text };
            const data = await apiRequest("/api/automation/jobs", {
                method: "POST",
                body: JSON.stringify({ type: channel, payload, runNow: true }),
            }, token);
            const jobMessage = data.job.result?.message || `${channel} queued.`;
            setResult(data.job.status === "failed" ? `Failed: ${jobMessage}` : jobMessage);
            await refresh();
        }
        catch (err) {
            setResult(err instanceof Error ? err.message : "Unable to send.");
        }
        finally {
            setSending(false);
        }
    };
    return (<div className="os-glass comm-sandbox" style={{ "--channel-tone": channelTone }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur border-b border-slate-700/50 px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            {channel === "email" && <Mail size={20} className="text-cyan-400"/>}
            {channel === "sms" && <MessageCircle size={20} className="text-cyan-400"/>}
            {channel === "telegram" && <MessageCircle size={20} className="text-cyan-400"/>}
            {channel === "call" && <PhoneCall size={20} className="text-cyan-400"/>}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{activeCopy.title}</h2>
            <p className="text-sm text-slate-400 mt-1">{activeCopy.subtitle}</p>
          </div>
        </div>
        <div className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
          <span className="text-xs font-semibold text-cyan-300">{activeCopy.status}</span>
        </div>
      </div>

      {/* Enhanced Channel Selector */}
      <div className="px-8 py-6 border-b border-slate-700/50">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Open Channel</p>
        <div className="channel-tabs">
          {["email", "sms", "telegram", "call"].map((item) => (
            <button 
              key={item} 
              type="button" 
              onClick={() => selectChannel(item)} 
              className={`channel-tab ${channel === item ? 'active' : ''}`}
              data-channel={item}
            >
              <div className="channel-tab-icon">
                {item === "email" && <Mail size={18}/>}
                {item === "sms" && <MessageCircle size={18}/>}
                {item === "telegram" && <FaTelegramPlane size={18}/>}
                {item === "call" && <PhoneCall size={18}/>}
              </div>
              <span className="channel-tab-label">{channelCopy[item].title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form or Telegram chat */}
      {channel === "telegram" ? (<div className="px-8 py-8">
          <TelegramConsole token={token} refresh={refresh} user={user} jobs={jobs} notifications={notifications}/>
        </div>) : (<form onSubmit={sendNow} className="px-8 py-8 space-y-6">
          <div className="px-4 py-3 bg-slate-800/30 border border-slate-700/30 rounded-lg">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-slate-200">{activeCopy.title}:</span>{" "}
              {activeCopy.note}
            </p>
          </div>

          {/* Recipient Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
              {activeCopy.recipient}
            </label>
            <input type={channel === "email" ? "email" : "text"} value={to} onChange={(event) => setTo(event.target.value)} placeholder={channel === "email" ? "name@example.com" : channel === "telegram" ? "123456789" : "+91 98765 43210"} required className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200"/>
          </div>

          {/* Subject (Email only) */}
          {channel === "email" ? (<div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">Subject Line</label>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What's this about?" className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200"/>
            </div>) : (<div className="px-4 py-3 bg-slate-800/30 border border-slate-700/30 rounded-lg">
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Status:</span>{" "}
                {`${activeCopy.title} ready`}
              </p>
            </div>)}

          {/* Message Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">{activeCopy.body}</label>
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={activeCopy.placeholder} required rows={4} className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 resize-none"/>
          </div>

          {/* Attachments Section */}
          {canSendAttachments && (<div className="space-y-4">
              <div className="attachment-toolbar">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="attach-action-button">
                  <Paperclip size={16}/>
                  <span>Attach files</span>
                </button>
                <span className="attachment-hint">Supports images, audio, video, and documents</span>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileInput} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"/>
              </div>

              {/* Upload Progress */}
              {uploading && (<div className="px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin"/>
                  <span className="text-sm text-blue-300">Uploading files…</span>
                </div>)}

              {/* Attachments List */}
              {attachments.length > 0 && (<div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Attachments ({attachments.length})</p>
                  <div className="grid gap-3">
                    {attachments.map((attachment, index) => (<div key={`${attachment.url}-${index}`} className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800/70 transition-colors duration-200 group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 bg-slate-700/50 rounded-lg flex-shrink-0">
                            {attachment.type.includes("image") && <Mail size={16} className="text-cyan-400"/>}
                            {attachment.type.includes("audio") && <Mic size={16} className="text-green-400"/>}
                            {attachment.type.includes("video") && <MessageCircle size={16} className="text-purple-400"/>}
                            {!attachment.type.includes("image") && !attachment.type.includes("audio") && !attachment.type.includes("video") && <Mail size={16} className="text-slate-400"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">{attachment.name}</p>
                            <p className="text-xs text-slate-500">{formatFileSize(attachment.size)}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeAttachment(index)} className="ml-3 flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-200">
                          Remove
                        </button>
                      </div>))}
                  </div>
                </div>)}

              {/* Voice Recording */}
              {(channel === "email" || channel === "telegram") && (<button type="button" onClick={recording ? stopRecording : startRecording} disabled={uploading || sending} className={recording
                        ? "w-full px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 border bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                        : "w-full px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 border bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"}>
                  {recording ? <MicOff size={18}/> : <Mic size={18}/>}
                  <span>{recording ? "Stop Recording" : "Record Voice Note"}</span>
                </button>)}
              {recordStatus && (<p className="text-xs text-slate-400 italic">{recordStatus}</p>)}
            </div>)}

          {/* Submit Button */}
          <button type="submit" disabled={sending || uploading} className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-slate-600 disabled:to-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50">
            <Send size={18}/>
            <span>{sending ? "Sending..." : activeCopy.action}</span>
          </button>

          {/* Result Message */}
          {result && (<div className={/configure|failed|sandbox|24-hour|template|joined/i.test(result)
                    ? "px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-200 bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-200 bg-green-500/10 border-green-500/30 text-green-300"}>
              {result}
            </div>)}
        </form>)}

      {channel !== "telegram" && (<aside className="comm-log-panel">
          <div className="comm-log-head">
            <div>
              <h3>{activeCopy.title} Log</h3>
              <p>{channelStats.total} total requests</p>
            </div>
            <div className="comm-log-icon">{getSandboxIcon()}</div>
          </div>
          <div className="comm-stat-grid">
            <div><span>Sent</span><strong>{channelStats.sent}</strong></div>
            <div><span>Failed</span><strong>{channelStats.failed}</strong></div>
            <div><span>Queued</span><strong>{Math.max(channelStats.total - channelStats.sent - channelStats.failed, 0)}</strong></div>
          </div>
          <div className="comm-log-list">
            {channelJobs.length > 0 ? channelJobs.map((job) => {
                const status = getJobStatusLabel(job);
                return (<div key={job._id} className="comm-log-item">
                  <div className={`comm-log-dot ${status}`}/>
                  <div>
                    <strong>{getChannelJobTitle(job)}</strong>
                    <p>{job.payload?.to || job.payload?.recipient || job.result?.to || "No recipient"}</p>
                    <span>{formatJobTime(job.createdAt)} · {status}</span>
                  </div>
                </div>);
            }) : (<div className="comm-empty-log">
              <ListTodo size={28}/>
              <strong>No {activeCopy.title.toLowerCase()} entries yet</strong>
              <span>Send one from the sandbox to populate this log.</span>
            </div>)}
          </div>
        </aside>)}

      {/* Telegram Note */}
      {channel !== "telegram" && (<div className="px-8 py-4 bg-slate-800/30 border-t border-slate-700/50">
          <p className="text-xs text-slate-400">
            {activeCopy.note}
          </p>
        </div>)}
    </div>);
};
const getJobText = (job) => String(job.payload?.text || job.payload?.message || job.payload?.body || job.result?.message || "Telegram message");
const getJobRecipient = (job, fallback = "") => String(job.payload?.to || job.payload?.recipient || job.result?.to || fallback || "Unknown chat");
const getTelegramState = (job) => {
    if (job.status === "failed" || job.result?.status === "failed")
        return "failed";
    if (job.status === "completed" || job.result?.status === "sent")
        return "seen";
    if (job.status === "processing")
        return "delivered";
    return "sent";
};
const TelegramTicks = ({ state }) => {
    if (state === "failed")
        return <span className="tg-failed">Failed</span>;
    if (state === "seen")
        return <CheckCheck size={14} className="tg-seen"/>;
    if (state === "delivered")
        return <CheckCheck size={14}/>;
    return <Check size={14}/>;
};
const TelegramConsole = ({ token, refresh, user, jobs, notifications = [], }) => {
    const telegramJobs = useMemo(() => jobs.filter((job) => job.type === "telegram").sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()), [jobs]);
    const telegramEvents = useMemo(() => {
        const outgoing = telegramJobs.map((job) => ({ ...job, direction: "outgoing" }));
        const inbound = notifications
            .filter((item) => item.channel === "telegram")
            .flatMap((item) => {
            const from = String(item.metadata?.from || user.telegramChatId || "Unknown chat");
            const createdAt = item.createdAt || new Date().toISOString();
            const mediaUrls = Array.isArray(item.metadata?.mediaUrls) ? item.metadata.mediaUrls : [];
            const mediaType = item.metadata?.mediaType;
            const replyToMessageId = item.metadata?.replyToMessageId;
            const isReply = item.metadata?.isReplyToBot && replyToMessageId;
            const isInbound = item.metadata?.inbound;
            
            const events = [];
            
            // If this is an inbound message (received from Telegram user)
            if (isInbound) {
                events.push({
                    _id: `in-${item._id}`,
                    createdAt,
                    direction: "incoming",
                    status: "received",
                    payload: { 
                        to: from, 
                        text: item.body || item.title || "Telegram message",
                        from: item.metadata?.from,
                        telegramUser: item.metadata?.telegramUser,
                    },
                    result: { status: "received", mediaUrls },
                    metadata: { mediaType, replyToMessageId, isReply, inbound: true },
                });
            }
            
            // If there's an AI reply, show it as outgoing
            if (item.metadata?.aiReply) {
                events.push({
                    _id: `out-${item._id}`,
                    createdAt,
                    direction: "outgoing",
                    status: "completed",
                    payload: { to: from, text: item.metadata.aiReply },
                    result: { status: "sent" },
                    metadata: { replyTo: item.body },
                });
            }
            
            return events;
        });
        return [...outgoing, ...inbound].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    }, [notifications, telegramJobs, user.telegramChatId]);
    const threads = useMemo(() => {
        const grouped = new Map();
        telegramEvents.forEach((job) => {
            const chatId = getJobRecipient(job, user.telegramChatId || "");
            grouped.set(chatId, [...(grouped.get(chatId) || []), job]);
        });
        const items = Array.from(grouped.entries()).map(([chatId, threadJobs]) => {
            const latest = threadJobs[threadJobs.length - 1];
            const time = latest?.createdAt
                ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(latest.createdAt))
                : "--:--";
            return {
                id: chatId,
                chatId,
                title: chatId === user.telegramChatId ? "My Telegram" : chatId,
                lastMessage: latest ? getJobText(latest) : "No messages yet",
                status: latest ? getTelegramState(latest) : "sent",
                time,
                jobs: threadJobs,
            };
        });
        if (items.length > 0)
            return items.sort((a, b) => b.jobs.length - a.jobs.length);
        return [
            {
                id: user.telegramChatId || "demo",
                chatId: user.telegramChatId || "",
                title: user.telegramChatId ? "My Telegram" : "New Telegram Chat",
                lastMessage: "Send a message to start the thread.",
                status: "sent",
                time: "--:--",
                jobs: [],
            },
        ];
    }, [user.telegramChatId, telegramEvents]);
    const [selectedId, setSelectedId] = useState(threads[0]?.id || "");
    const [draft, setDraft] = useState("");
    const [to, setTo] = useState(user.telegramChatId || "");
    const [selectedContact, setSelectedContact] = useState("");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState("");
    const fileInputRef = useRef(null);
    const recorderRef = useRef(null);
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [recordingAudio, setRecordingAudio] = useState(false);
    const [recordStatus, setRecordStatus] = useState("");
    const [dragActive, setDragActive] = useState(false);
    // New sharing type states
    const [shareType, setShareType] = useState("message"); // message, location, contact, venue, poll, forward
    const [locationData, setLocationData] = useState({ latitude: 28.6139, longitude: 77.2090, horizontalAccuracy: 100 });
    const [contactData, setContactData] = useState({ phoneNumber: "", firstName: "", lastName: "" });
    const [venueData, setVenueData] = useState({ latitude: 28.6139, longitude: 77.2090, title: "", address: "" });
    const [pollData, setPollData] = useState({ question: "", options: ["", ""], isAnonymous: true, allowsMultipleAnswers: false });
    const [forwardData, setForwardData] = useState({ fromChatId: "", messageId: "" });
    const chatHistoryRef = useRef(null);
    const chatEndRef = useRef(null);
    const addAttachments = async (files) => {
        if (!files.length)
            return;
        setUploading(true);
        try {
            const uploaded = await Promise.all(files.map((file) => uploadToServer(file, token)));
            setAttachments((current) => [...current, ...uploaded]);
        }
        catch (err) {
            setResult(err instanceof Error ? err.message : "Upload failed.");
        }
        finally {
            setUploading(false);
        }
    };
    const handleFileInput = (event) => {
        if (!event.target.files)
            return;
        addAttachments(Array.from(event.target.files));
        event.target.value = "";
    };
    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        if (!event.dataTransfer.files)
            return;
        addAttachments(Array.from(event.dataTransfer.files));
    };
    const removeAttachment = (index) => {
        setAttachments((current) => current.filter((_, idx) => idx !== index));
    };
    const startRecordingAudio = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setResult("Voice recording is not supported in this browser.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0)
                    chunks.push(event.data);
            };
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: "audio/webm" });
                const file = new File([blob], `nanna-voice-${Date.now()}.webm`, { type: blob.type });
                await addAttachments([file]);
                stream.getTracks().forEach((track) => track.stop());
                recorderRef.current = null;
                setRecordingAudio(false);
                setRecordStatus("Voice note attached.");
            };
            recorderRef.current = recorder;
            recorder.start();
            setRecordingAudio(true);
            setRecordStatus("Recording voice note...");
        }
        catch (error) {
            setResult(error instanceof Error ? error.message : "Unable to start recording.");
        }
    };
    const stopRecordingAudio = () => {
        if (!recorderRef.current)
            return;
        recorderRef.current.stop();
        setRecordStatus("Stopping recording...");
    };
    useEffect(() => {
        if (!threads.some((thread) => thread.id === selectedId)) {
            setSelectedId(threads[0]?.id || "");
        }
    }, [selectedId, threads]);
    const activeThread = threads.find((thread) => thread.id === selectedId) || threads[0];
    useEffect(() => {
        const history = chatHistoryRef.current;
        if (!history)
            return;
        requestAnimationFrame(() => {
            chatEndRef.current?.scrollIntoView({ block: "end" });
            history.scrollTop = history.scrollHeight;
        });
    }, [activeThread?.id, activeThread?.jobs.length, telegramEvents.length]);
    useEffect(() => {
        if (activeThread?.chatId && activeThread.chatId !== "Unknown chat") {
            setTo(activeThread.chatId);
        }
    }, [activeThread?.chatId]);
    const sendTelegram = async (event) => {
        event.preventDefault();
        if (!to.trim()) {
            setResult("Enter a Telegram chat ID or phone number. The user must open your bot once before you can message them.");
            return;
        }
        setSending(true);
        setResult("");
        try {
            let payload = { to };
            
            // Handle different sharing types
            if (shareType === "location") {
                payload = {
                    ...payload,
                    shareType: "location",
                    latitude: locationData.latitude,
                    longitude: locationData.longitude,
                    horizontalAccuracy: locationData.horizontalAccuracy,
                    text: draft || "Here's my location",
                };
            } else if (shareType === "contact") {
                if (!contactData.phoneNumber) {
                    setResult("Please enter a phone number for the contact.");
                    setSending(false);
                    return;
                }
                payload = {
                    ...payload,
                    shareType: "contact",
                    phoneNumber: contactData.phoneNumber,
                    firstName: contactData.firstName || "Contact",
                    lastName: contactData.lastName,
                    text: draft || `Contact: ${contactData.firstName}`,
                };
            } else if (shareType === "venue") {
                if (!venueData.title || !venueData.address) {
                    setResult("Please enter venue title and address.");
                    setSending(false);
                    return;
                }
                payload = {
                    ...payload,
                    shareType: "venue",
                    latitude: venueData.latitude,
                    longitude: venueData.longitude,
                    title: venueData.title,
                    address: venueData.address,
                    text: draft || `Venue: ${venueData.title}`,
                };
            } else if (shareType === "poll") {
                if (!pollData.question || pollData.options.filter(o => o.trim()).length < 2) {
                    setResult("Please enter a poll question and at least 2 options.");
                    setSending(false);
                    return;
                }
                payload = {
                    ...payload,
                    shareType: "poll",
                    question: pollData.question,
                    options: pollData.options.filter(o => o.trim()),
                    isAnonymous: pollData.isAnonymous,
                    allowsMultipleAnswers: pollData.allowsMultipleAnswers,
                    text: draft || `Poll: ${pollData.question}`,
                };
            } else if (shareType === "forward") {
                if (!forwardData.fromChatId || !forwardData.messageId) {
                    setResult("Please enter source chat ID and message ID.");
                    setSending(false);
                    return;
                }
                payload = {
                    ...payload,
                    shareType: "forward",
                    fromChatId: forwardData.fromChatId,
                    messageId: parseInt(forwardData.messageId),
                    text: draft || "Forwarded message",
                };
            } else {
                // Default message type
                if (!draft.trim()) {
                    setResult("Please enter a message.");
                    setSending(false);
                    return;
                }
                payload = { to, text: draft };
                if (attachments.length > 0) {
                    payload.mediaUrls = attachments.map((item) => item.url);
                    payload.attachments = attachments;
                }
            }
            
            const data = await apiRequest("/api/automation/jobs", {
                method: "POST",
                body: JSON.stringify({ type: "telegram", payload, runNow: true }),
            }, token);
            const jobMessage = data.job.result?.message || "Telegram queued.";
            setResult(data.job.status === "failed" ? `Failed: ${jobMessage}` : jobMessage);
            setDraft("");
            setAttachments([]);
            await refresh();
        }
        catch (error) {
            setResult(error instanceof Error ? error.message : "Unable to send Telegram.");
        }
        finally {
            setSending(false);
        }
    };
    const linkStatus = user.telegramChatId
        ? `Linked chat ID: ${user.telegramChatId}`
        : "Message your bot once, then save the chat ID NANNA replies with in Profile.";
    return (<section className="tg-console">
      <div className="tg-sidebar">
        <div className="tg-sidebar-head">
          <div>
            <h2>Telegram</h2>
            <p>{linkStatus}</p>
          </div>
          <FaTelegramPlane size={20} color="#229ED9"/>
        </div>
        <div className="tg-search">
          <Search size={15}/>
          <span>Search or start a new chat</span>
        </div>
        <div className="tg-thread-list">
          {threads.map((thread) => (<button key={thread.id} type="button" className={thread.id === activeThread?.id ? "tg-thread active" : "tg-thread"} onClick={() => setSelectedId(thread.id)}>
              <div className="tg-contact-avatar">{thread.title.slice(0, 1).toUpperCase()}</div>
              <div className="tg-thread-main">
                <div className="tg-thread-top">
                  <strong>{thread.title}</strong>
                  <span>{thread.time}</span>
                </div>
                <div className="tg-thread-bottom">
                  <TelegramTicks state={thread.status}/>
                  <span>{thread.lastMessage}</span>
                </div>
              </div>
            </button>))}
        </div>
      </div>

      <div className="tg-chat-window">
        <div className="tg-chat-head">
          <div className="tg-contact-avatar large">{activeThread?.title.slice(0, 1).toUpperCase()}</div>
          <div>
            <h3>{activeThread?.title || "Telegram Chat"}</h3>
            <p>{activeThread?.jobs.length ? "online" : "no messages yet"}</p>
          </div>
        </div>


        <div className="tg-chat-history" ref={chatHistoryRef}>
          {activeThread?.jobs.length ? (activeThread.jobs.map((job) => {
            const state = getTelegramState(job);
            const time = job.createdAt
                ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(job.createdAt))
                : "--:--";
            const payloadMedia = job.payload?.["mediaUrls"];
            const resultMedia = job.result?.["mediaUrls"];
            const mediaUrls = Array.isArray(payloadMedia)
                ? payloadMedia
                : Array.isArray(resultMedia)
                    ? resultMedia
                    : [];
            const direction = job.direction === "incoming" ? "incoming" : "outgoing";
            const isReply = job.metadata?.isReply;
            const replyToMessageId = job.metadata?.replyToMessageId;
            
            let quotedMessage = null;
            if (isReply && replyToMessageId) {
              const parentJob = activeThread.jobs.find((j) => j.result?.messageIds?.includes(Number(replyToMessageId)));
              if (parentJob) {
                quotedMessage = getJobText(parentJob);
              }
            }
            
            return (<div key={job._id} className={state === "failed" ? "tg-message failed" : `tg-message ${direction}`}>
                  {isReply && quotedMessage && (<div style={{ fontSize: 12, color: colors.muted, borderLeft: "3px solid rgba(59, 130, 246, 0.5)", paddingLeft: 10, marginBottom: 8 }}>
                      <div>In reply to:</div>
                      <div style={{ marginTop: 4, fontStyle: "italic" }}>{quotedMessage.slice(0, 60)}{quotedMessage.length > 60 ? "…" : ""}</div>
                    </div>)}
                  <div>{getJobText(job)}</div>
                  {mediaUrls.length > 0 && (<div className="tg-attachment-list">
                      {mediaUrls.map((url, index) => (<div key={`${url}-${index}`} className="tg-attachment-preview">
                          {/(?:\.mp3|\.webm|\.wav|\.m4a)$/i.test(url) ? (<audio controls src={url}/>) : /(?:\.mp4|\.webm|\.mov)$/i.test(url) ? (<video controls src={url} className="tg-attachment-video"/>) : /(?:\.jpe?g|\.png|\.gif|\.bmp|\.webp)$/i.test(url) ? (<img src={url} alt="attachment" className="tg-attachment-image"/>) : (<a href={url} target="_blank" rel="noreferrer" className="tg-attachment-file">{url.split("/").pop()}</a>)}
                        </div>))}
                    </div>)}
                  {job.result?.message && state === "failed" && <p>{job.result.message}</p>}
                  <span>
                    {time}
                    <TelegramTicks state={state}/>
                  </span>
                </div>);
        })) : (<div className="tg-empty-thread">No Telegram messages yet. Send one to create customer-visible chat history.</div>)}
          <div ref={chatEndRef} className="tg-chat-end" aria-hidden="true"/>
        </div>

        {attachments.length > 0 && (<div className="tg-attachment-strip">
            {attachments.map((attachment, index) => (<div key={`${attachment.url}-${index}`} className="tg-attachment-item">
                <div className="tg-attachment-meta">
                  <span>{attachment.name}</span>
                  <span>{formatFileSize(attachment.size)}</span>
                </div>
                <button type="button" onClick={() => removeAttachment(index)} className="tg-attachment-remove">Remove</button>
              </div>))}
          </div>)}

        <form className={dragActive ? "tg-compose drag-active" : "tg-compose"} onSubmit={sendTelegram} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
          <input className="tg-recipient-input" value={to} onChange={(event) => setTo(event.target.value)} placeholder="Chat ID or saved phone"/>
          <input className="tg-message-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a Telegram message"/>
          <button type="button" className={recordingAudio ? "tg-voice-button recording" : "tg-voice-button"} onClick={() => (recordingAudio ? stopRecordingAudio() : startRecordingAudio())} title="Record voice note">
            {recordingAudio ? <MicOff size={18}/> : <Mic size={18}/>}
          </button>
          <button type="button" className="tg-file-button" onClick={() => fileInputRef.current?.click()} title="Attach file">
            <Paperclip size={18}/>
          </button>
          <button type="submit" disabled={sending}>
            <Send size={17}/>
          </button>
          <input ref={fileInputRef} type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleFileInput}/>
        </form>
        {recordStatus && <div className="tg-record-status">{recordStatus}</div>}
        {result && <div className={/failed|auth|token|expired|configure|sandbox|template|joined/i.test(result) ? "tg-result warn" : "tg-result"}>{result}</div>}
      </div>
    </section>);
};

// ─────────────────────────────────────────────────────────────
// MediaStudio Component
// ─────────────────────────────────────────────────────────────
const MediaStudio = () => {

  // ── Refs ──────────────────────────────────────────────────
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const streamRef       = useRef(null);
  const recorderRef     = useRef(null);
  const chunksRef       = useRef([]);
  const capturesRef     = useRef([]);
  const faceIntervalRef = useRef(null);
  const modelsReadyRef  = useRef(false); // ← moved here, outside functions

  // ── State ─────────────────────────────────────────────────
  const [cameraOn,          setCameraOn]          = useState(false);
  const [recording,         setRecording]         = useState(false);
  const [query,             setQuery]             = useState("");
  const [status,            setStatus]            = useState("Camera idle");
  const [captures,          setCaptures]          = useState([]);
  const [faceStatus,        setFaceStatus]        = useState("No Face");
  const [recognizedUser,    setRecognizedUser]    = useState(null);
  const [confidence,        setConfidence]        = useState(0);
  const [registeredFaces,   setRegisteredFaces]   = useState([]);
  const [regName,           setRegName]           = useState("");
  const [regRelationship,   setRegRelationship]   = useState("Other");
  const [regFile,           setRegFile]           = useState(null);
  const [regStatus,         setRegStatus]         = useState("");
  const [regLoading,        setRegLoading]        = useState(false);

  const RELATIONSHIPS = ["Me", "Spouse", "Parent", "Child", "Sibling", "Grandparent", "Friend", "Other"];

  // ── Sync captures ref ─────────────────────────────────────
  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  // ── Load models + fetch faces on mount ────────────────────
  useEffect(() => {
    loadFaceModels();
    fetchRegisteredFaces();
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      capturesRef.current.forEach((c) => {
        if (c.url.startsWith("blob:")) URL.revokeObjectURL(c.url);
      });
    };
  }, []);

  // ── Media command listener ────────────────────────────────
  useEffect(() => {
    const onMediaCommand = (event) => {
      const detail    = event.detail || {};
      const command   = String(detail.command || "");
      const provider  = String(detail.provider || "youtube") === "spotify" ? "spotify" : "youtube";
      const mediaQuery = String(detail.query || "");

      if (command === "open_camera")  { startCamera(); return; }
      if (command === "take_photo")   {
        if (cameraOn) takePhoto();
        else { setStatus("Opening camera and taking photo..."); startCamera().then(() => takePhoto()); }
        return;
      }
      if (command === "record_video") {
        if (cameraOn) startVideoRecording();
        else { setStatus("Opening camera and recording video..."); startCamera().then(() => startVideoRecording()); }
        return;
      }
      openMedia(provider, mediaQuery);
    };

    window.addEventListener("nanna-media-command", onMediaCommand);
    return () => window.removeEventListener("nanna-media-command", onMediaCommand);
  }, [query, cameraOn]);

  // ─────────────────────────────────────────────────────────
  // FACE API — Model Loading
  // ─────────────────────────────────────────────────────────

  const loadFaceModels = async () => {
    const MODEL_URL = "/models"; // served from frontend/public/models/
    try {
      setFaceStatus("Loading AI models...");
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      modelsReadyRef.current = true;
      setFaceStatus("Models ready");
      console.log("[face-api] Models loaded locally from /models");
    } catch (err) {
      console.error("[face-api] Model load failed:", err);
      setFaceStatus("Model load failed");
    }
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Helper: extract 128-float descriptor from <img>
  // ─────────────────────────────────────────────────────────

  const getDescriptorFromImage = async (imgEl) => {
    const detection = await faceapi
      .detectSingleFace(imgEl, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? Array.from(detection.descriptor) : null;
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Helper: POST descriptor to /api/face/register
  // ─────────────────────────────────────────────────────────

  const postRegister = async (name, relationship, descriptor) => {
    const res = await fetch("/api/face/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, relationship, descriptor }),
    });
    return res.json(); // { success, member } or { success: false, error }
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Register single face from file picker
  //            POST /api/face/register
  // ─────────────────────────────────────────────────────────

  const registerFaceFromFile = async () => {
    if (!regName.trim())           { setRegStatus("❌ Enter a name before registering."); return; }
    if (!regFile)                  { setRegStatus("❌ Pick an image file first."); return; }
    if (!modelsReadyRef.current)   { setRegStatus("⏳ Face models still loading — please wait."); return; }

    setRegLoading(true);
    setRegStatus("📂 Reading image…");

    try {
      // 1. Load chosen file into an offscreen <img>
      const objectUrl = URL.createObjectURL(regFile);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload  = resolve;
        img.onerror = () => reject(new Error("Could not load the image file."));
        img.src = objectUrl;
      });

      // 2. Extract face descriptor
      setRegStatus("🔍 Detecting face…");
      const descriptor = await getDescriptorFromImage(img);
      URL.revokeObjectURL(objectUrl); // free memory immediately

      if (!descriptor) {
        setRegStatus("❌ No face detected. Try a clearer, well-lit photo.");
        setRegLoading(false);
        return;
      }

      // 3. POST to backend → saved in MongoDB
      setRegStatus("💾 Saving to database…");
      const data = await postRegister(regName.trim(), regRelationship, descriptor);

      if (data.success) {
        setRegStatus(`✅ "${data.member.name}" (${data.member.relationship}) registered.`);
        setRegName("");
        setRegFile(null);
        await fetchRegisteredFaces(); // refresh list from DB
      } else {
        setRegStatus(`❌ ${data.error}`); // e.g. duplicate name (409)
      }

    } catch (err) {
      console.error("[registerFaceFromFile]", err);
      setRegStatus(`❌ ${err.message || "Network or processing error."}`);
    }

    setRegLoading(false);
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Bulk register from public/faces/ via manifest
  //            GET /api/face/manifest → [{ file, name, relationship }]
  //            Folder structure: public/faces/<Name__Relationship>/photo.jpg
  // ─────────────────────────────────────────────────────────

  const registerAllFromPublic = async () => {
    if (!modelsReadyRef.current) {
      setRegStatus("⏳ Face models still loading — please wait.");
      return;
    }

    setRegLoading(true);
    setRegStatus("📡 Fetching manifest from /api/face/manifest…");

    try {
      // 1. Fetch manifest
      const res      = await fetch("/api/face/manifest");
      const manifest = await res.json();

      if (!Array.isArray(manifest) || manifest.length === 0) {
        setRegStatus("❌ Manifest empty. Add images to public/faces/<Name__Relationship>/");
        setRegLoading(false);
        return;
      }

      let registered = 0, skippedNoFace = 0, skippedDuplicate = 0, failed = 0;

      // 2. Process each image entry one by one
      for (const entry of manifest) {
        setRegStatus(`🖼 Processing ${entry.name} (${entry.file})…`);

        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload  = resolve;
            img.onerror = () => reject(new Error(`Could not load ${entry.file}`));
            img.src = `/${entry.file}`; // served by Vite / express.static from public/
          });

          const descriptor = await getDescriptorFromImage(img);
          if (!descriptor) { skippedNoFace++; continue; }

          const data = await postRegister(entry.name, entry.relationship, descriptor);

          if (data.success)                                    registered++;
          else if (data.error?.includes("already registered")) skippedDuplicate++;
          else                                                 failed++;

        } catch (entryErr) {
          console.error(`[bulkRegister] ${entry.file}:`, entryErr);
          failed++;
        }
      }

      // 3. Summary
      setRegStatus(
        `✅ Done — ${registered} registered` +
        (skippedNoFace    ? `, ${skippedNoFace} no face detected`   : "") +
        (skippedDuplicate ? `, ${skippedDuplicate} already in DB`   : "") +
        (failed           ? `, ${failed} failed`                    : "") +
        "."
      );

      await fetchRegisteredFaces();

    } catch (err) {
      console.error("[registerAllFromPublic]", err);
      setRegStatus("❌ Could not reach /api/face/manifest. Is the backend running?");
    }

    setRegLoading(false);
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Fetch registered faces from DB
  //            GET /api/face/list → { success, count, members }
  // ─────────────────────────────────────────────────────────

  const fetchRegisteredFaces = async () => {
    try {
      const res         = await fetch("/api/face/list");
      const contentType = res.headers.get("content-type") || "";

      // Guard: if backend is down, Vite returns HTML — don't try to parse it
      if (!contentType.includes("application/json")) {
        console.error("[fetchRegisteredFaces] Got HTML — is the backend running?");
        return;
      }

      const data = await res.json();
      if (data.success) {
        setRegisteredFaces(data.members); // { success, count, members: [...] }
      } else {
        console.error("[fetchRegisteredFaces] API error:", data.error);
      }
    } catch (err) {
      console.error("[fetchRegisteredFaces]", err);
    }
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Delete single face by ID
  //            DELETE /api/face/:id → { success, message }
  // ─────────────────────────────────────────────────────────

  const removeFaceById = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from the registry?`)) return;
    try {
      const res  = await fetch(`/api/face/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setRegisteredFaces((prev) => prev.filter((f) => f._id !== id)); // optimistic update
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (err) {
      console.error("[removeFaceById]", err);
      alert("❌ Network error while removing face.");
    }
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Reset all faces
  //            DELETE /api/face/reset → { success, deleted }
  // ─────────────────────────────────────────────────────────

  const resetAllFaces = async () => {
    if (!window.confirm("Remove ALL registered faces? This cannot be undone.")) return;
    try {
      const res  = await fetch("/api/face/reset", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setRegisteredFaces([]);
        alert(`✅ Cleared ${data.deleted} face(s).`);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (err) {
      console.error("[resetAllFaces]", err);
      alert("❌ Network error while resetting faces.");
    }
  };

  // ─────────────────────────────────────────────────────────
  // FACE API — Live recognition loop (runs while camera is on)
  //            POST /api/face/recognize → { recognized, name, confidence }
  // ─────────────────────────────────────────────────────────

  const startFaceRecognition = () => {
    const video = videoRef.current;
    if (!video) return;

    const beginPolling = () => {
      if (faceIntervalRef.current) return; // already running

      faceIntervalRef.current = setInterval(async () => {
        const v = videoRef.current;
        // Skip if models not ready, video not playing, or no frame yet
        if (!modelsReadyRef.current || !v || v.readyState < 2 || v.videoWidth === 0) return;

        try {
          const detection = await faceapi
            .detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) {
            setFaceStatus("No Face");
            setRecognizedUser(null);
            return;
          }

          setFaceStatus("Face Detected");
          const descriptor = Array.from(detection.descriptor);

          const res    = await fetch("/api/face/recognize", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ descriptor }),
          });
          const result = await res.json();

          if (result.recognized) {
            setRecognizedUser(result.name);
            setConfidence(result.confidence ?? Math.round((1 - result.distance) * 100));
          } else {
            setRecognizedUser("Unknown");
            setConfidence(0);
          }
        } catch (err) {
          console.error("[faceRecognition]", err);
        }
      }, 1200);
    };

    if (video.readyState >= 2) beginPolling();
    else video.addEventListener("loadeddata", beginPolling, { once: true });
  };

  // ─────────────────────────────────────────────────────────
  // CAMERA — Start / Stop / Photo / Video
  // ─────────────────────────────────────────────────────────

  const openMedia = (provider, searchTerm = query) => {
    const search = encodeURIComponent(searchTerm.trim());
    const url = provider === "youtube"
      ? (search ? `https://www.youtube.com/results?search_query=${search}` : "https://www.youtube.com/")
      : (search ? `https://open.spotify.com/search/${search}` : "https://open.spotify.com/");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus("Camera ready");
      startFaceRecognition();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to open camera.");
    }
  };

  const stopCamera = () => {
    if (recording) recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setStatus("Camera stopped");
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
  };

  const takePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraOn) { setStatus("Open the camera first."); return; }
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    setCaptures((prev) => [{ id: `${Date.now()}`, type: "photo", url, name: `nanna-photo-${Date.now()}.png` }, ...prev]);
    setStatus("Photo captured");
  };

  const startVideoRecording = () => {
    const stream = streamRef.current;
    if (!stream) { setStatus("Open the camera first."); return; }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url  = URL.createObjectURL(blob);
      setCaptures((prev) => [{ id: `${Date.now()}`, type: "video", url, name: `nanna-video-${Date.now()}.webm` }, ...prev]);
      setRecording(false);
      setStatus("Video recorded");
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setStatus("Recording video...");
  };

  const stopVideoRecording = () => {
    recorderRef.current?.stop();
    setStatus("Saving video...");
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="media-studio">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="media-studio-head">
        <div>
          <h2>Media Studio</h2>
          <p>YouTube, Spotify, camera photos, and video recording</p>
        </div>
        <StatusPill label="Camera" value={cameraOn ? "on" : "off"} tone={cameraOn ? colors.mint : colors.amber} />
      </div>

      {/* ── Media launcher ─────────────────────────────────── */}
      <div className="media-launcher">
        <input
          style={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs or videos..."
        />
        <button type="button" onClick={() => openMedia("youtube")} style={styles.ghostButton}>
          <Music size={17} /> YouTube
        </button>
        <button type="button" onClick={() => openMedia("spotify")} style={styles.ghostButton}>
          <Music size={17} /> Spotify
        </button>
      </div>

      {/* ── Face Registration ──────────────────────────────── */}
      <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 13, opacity: 0.7, width: "100%" }}>📁 Register Face from Image</strong>

        {/* Name */}
        <input
          style={{ ...styles.input, flex: "1 1 140px" }}
          value={regName}
          onChange={(e) => setRegName(e.target.value)}
          placeholder="Full name"
        />

        {/* Relationship */}
        <select
          style={{ ...styles.input, flex: "0 0 140px" }}
          value={regRelationship}
          onChange={(e) => setRegRelationship(e.target.value)}
        >
          {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* File picker */}
        <input
          type="file"
          accept="image/*"
          style={{ flex: "1 1 180px", fontSize: 13 }}
          onChange={(e) => setRegFile(e.target.files?.[0] || null)}
        />

        {/* Register single file */}
        <button type="button" onClick={registerFaceFromFile} disabled={regLoading} style={styles.ghostButton}>
          Register
        </button>

        {/* Bulk register from public/faces/ */}
        <button
          type="button"
          onClick={registerAllFromPublic}
          disabled={regLoading}
          style={styles.ghostButton}
          title="Reads public/faces/<Name__Relationship>/<photo> via /api/face/manifest"
        >
          📂 Register All from public/faces/
        </button>

        {regStatus && <span style={{ fontSize: 12, opacity: 0.8, width: "100%" }}>{regStatus}</span>}
      </div>

      {/* ── Camera preview ─────────────────────────────────── */}
      <div className="camera-grid">
        <div className="camera-preview" style={{ position: "relative" }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
          {!cameraOn && (
            <div className="camera-placeholder">
              <Camera size={34} />
              Open camera to preview
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Live AI overlay */}
          {cameraOn && (
            <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 4, pointerEvents: "none" }}>
              <span style={{ background: faceStatus === "Face Detected" ? "rgba(0,200,100,0.85)" : "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20 }}>
                🤖 {faceStatus}
              </span>
              {recognizedUser && (
                <span style={{ background: recognizedUser === "Unknown" ? "rgba(200,80,0,0.85)" : "rgba(30,100,220,0.85)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
                  👤 {recognizedUser}{recognizedUser !== "Unknown" && confidence > 0 && ` · ${confidence}%`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Camera controls */}
        <div className="camera-actions">
          <button type="button" onClick={cameraOn ? stopCamera : startCamera} style={cameraOn ? styles.button : styles.ghostButton}>
            <Camera size={17} /> {cameraOn ? "Close Camera" : "Open Camera"}
          </button>
          <button type="button" onClick={takePhoto} disabled={!cameraOn} style={styles.ghostButton}>
            <Camera size={17} /> Take Photo
          </button>
          <button type="button" onClick={recording ? stopVideoRecording : startVideoRecording} disabled={!cameraOn} style={recording ? styles.button : styles.ghostButton}>
            {recording ? <MicOff size={17} /> : <Radio size={17} />}
            {recording ? "Stop Video" : "Record Video"}
          </button>
          <div className="camera-status">{status}</div>
          <div className="camera-status">AI Vision: {faceStatus}</div>
          {recognizedUser && (
            <div className="camera-status">👤 {recognizedUser}<br />Confidence: {confidence}%</div>
          )}
        </div>
      </div>

      {/* ── Capture strip ──────────────────────────────────── */}
      {captures.length > 0 && (
        <div className="capture-strip">
          {captures.map((capture) => (
            <a key={capture.id} href={capture.url} download={capture.name} className="capture-item">
              {capture.type === "photo"
                ? <img src={capture.url} alt={capture.name} />
                : <video src={capture.url} muted />}
              <span>{capture.type === "photo" ? "Photo" : "Video"}</span>
            </a>
          ))}
        </div>
      )}

      {/* ── Registered Faces panel ─────────────────────────── */}
      <div className="face-registry-panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>Registered Faces ({registeredFaces.length})</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={fetchRegisteredFaces} style={styles.ghostButton}>Refresh</button>
            {registeredFaces.length > 0 && (
              <button type="button" onClick={resetAllFaces} style={{ ...styles.ghostButton, color: "salmon" }}>Reset All</button>
            )}
          </div>
        </div>

        {registeredFaces.length === 0 ? (
          <p style={{ opacity: 0.5, fontSize: 13 }}>
            No faces registered yet. Pick an image above and click <strong>Register</strong>,
            or use <strong>Register All from public/faces/</strong> for bulk import.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {registeredFaces.map((face) => (
              <div key={face._id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
                <span>👤 <strong>{face.name}</strong> — {face.relationship}</span>
                <button
                  type="button"
                  onClick={() => removeFaceById(face._id, face.name)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "salmon", fontSize: 15, padding: 0 }}
                  aria-label={`Remove ${face.name}`}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};


const DevicesPanel = ({ token, devices, setDevices }) => {
const [name, setName] = useState("");
const [type, setType] = useState("light");
const [protocol, setProtocol] = useState("bluetooth");
const [ipAddress, setIpAddress] = useState("");
const [bleServiceUUID, setBleServiceUUID] = useState("");
const [bleCharUUID, setBleCharUUID] = useState("");



useEffect(() => {
  const handleDeviceAdded = (device) => {
    setDevices((prev = []) => {
      const exists = prev.find((d) => d._id === device._id);
      if (exists) return prev;
      return [...prev, device];
    });
  };

  const handleDeviceUpdated = (updatedDevice) => {
    setDevices((prev = []) =>
      prev.map((d) =>
        d._id === updatedDevice._id ? updatedDevice : d
      )
    );
  };
  return () => {
    socket.off("device-added", handleDeviceAdded);
    socket.off("device-updated", handleDeviceUpdated);
  };
}, []);
const addDevice = async (e) => {
  e.preventDefault();

  try {
    const payload = {
      name,
      type,
      protocol,
    };

    if (protocol === "wifi") {
      payload.ipAddress = ipAddress;
    }

    if (protocol === "bluetooth") {
      payload.bleServiceUUID = bleServiceUUID;
      payload.bleCharUUID = bleCharUUID;
    }

    const res = await apiRequest(
      "/api/devices",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    );
console.log("ADD DEVICE RESPONSE", res);

setDevices((prev) => [
  ...(Array.isArray(prev) ? prev : []),
  res?.data || res?.device || res
]);

    setName("");
    setIpAddress("");
    setBleServiceUUID("");
    setBleCharUUID("");
  } catch (err) {
    console.error(err);
  }
};
const connectDevice = async (device) => {
  try {
    if (device.protocol === "bluetooth") {

      const bleDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          device.bleServiceUUID,
        ],
      });

      const server = await bleDevice.gatt.connect();

      const service = await server.getPrimaryService(
        device.bleServiceUUID
      );

      const characteristic =
        await service.getCharacteristic(
          device.bleCharUUID
        );

      bleDeviceRef.current = bleDevice;
      bleServerRef.current = server;
      bleCharacteristicRef.current = characteristic;
    }

    const res = await apiRequest(
      `/api/devices/${device._id}/connect`,
      {
        method: "POST",
      },
      token
    );

    setDevices((prev) =>
      prev.map((d) =>
        d._id === device._id
          ? { ...d, ...res.data }
          : d
      )
    );

  } catch (err) {
    console.error(err);
  }
};
const disconnectDevice = async (deviceId) => {
  try {
    const res = await apiRequest(
      `/api/devices/${deviceId}/disconnect`,
      { method: "POST" },
      token
    );

    setDevices((prev) =>
      prev.map((d) =>
        d._id === deviceId
          ? { ...d, ...res.data }
          : d
      )
    );
  } catch (err) {
    console.error(err);
  }
};
const toggleDevice = async (deviceId) => {
  try {
    const res = await apiRequest(
      `/api/devices/${deviceId}/toggle`,
      { method: "POST" },
      token
    );

    setDevices((prev) =>
      prev.map((d) =>
        d._id === deviceId
          ? { ...d, ...res.data }
          : d
      )
    );
  } catch (err) {
    console.error(err);
  }
};
const updateDeviceState = async (deviceId, updates) => {
  try {
    const res = await apiRequest(
      `/api/devices/${deviceId}/state`,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      },
      token
    );

    setDevices((prev) =>
      prev.map((d) =>
        d._id === deviceId
          ? {
              ...d,
              state: {
                ...d.state,
                ...res.data.state,
                ...updates, // instant UI sync
              },
            }
          : d
      )
    );
  } catch (err) {
    console.error(err);
  }
};
return (
  <Panel
    icon={<Home size={21} />}
    title="Smart Home"
    subtitle="Bluetooth & WiFi Smart Devices"
  >
    {/* Add Device Form */}
    <form
      onSubmit={addDevice}
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <input
        style={styles.input}
        placeholder="Device Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <select
        style={styles.input}
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        {[
          "light",
          "fan",
          "ac",
          "camera",
          "speaker",
          "tv",
          "custom",
        ].map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <select
        style={styles.input}
        value={protocol}
        onChange={(e) => setProtocol(e.target.value)}
      >
        <option value="bluetooth">
          Bluetooth
        </option>

        <option value="wifi">
          WiFi
        </option>
      </select>

      {/* WiFi Fields */}
      {protocol === "wifi" && (
        <input
          style={styles.input}
          placeholder="IP Address"
          value={ipAddress}
          onChange={(e) =>
            setIpAddress(e.target.value)
          }
        />
      )}

      {/* Bluetooth Fields */}
      {protocol === "bluetooth" && (
        <>
          <input
            style={styles.input}
            placeholder="BLE Service UUID"
            value={bleServiceUUID}
            onChange={(e) =>
              setBleServiceUUID(
                e.target.value
              )
            }
          />

          <input
            style={styles.input}
            placeholder="BLE Characteristic UUID"
            value={bleCharUUID}
            onChange={(e) =>
              setBleCharUUID(
                e.target.value
              )
            }
          />
        </>
      )}

      <button
        type="submit"
        style={styles.button}
      >
        Add Device
      </button>
    </form>

    {/* Devices Grid */}
    <div className="device-grid">
     {(devices || []).filter(Boolean).map((device) => (
        <div
          key={device._id}
          className={
            device.state?.power
              ? "device-card device-card-on"
              : "device-card"
          }
        >
          {/* Header */}
          <div className="device-card-head">
            <h3>{device.name}</h3>

            <span
              style={{
                color:
                  device.connectionStatus ===
                  "connected"
                    ? "#22c55e"
                    : "#ef4444",
                fontWeight: 600,
              }}
            >
              {device.connectionStatus}
            </span>
          </div>

          <p>
            {device.type} •{" "}
            {device.protocol}
          </p>

          {/* Connect Button */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 10,
            }}
          >
            {device.connectionStatus ===
            "connected" ? (
              <button
                style={styles.button}
                onClick={() =>
                  disconnectDevice(
                    device
                  )
                }
              >
                Disconnect
              </button>
            ) : (
              <button
                style={styles.button}
                onClick={() =>
                  connectDevice(
                    device
                  )
                }
              >
                Connect
              </button>
            )}

            <button
              style={styles.button}
              onClick={() =>
                toggleDevice(
                  device._id
                )
              }
            >
              {device.state?.power
                ? "Turn Off"
                : "Turn On"}
            </button>
          </div>

          {/* Controls */}
          {device.connectionStatus ===
            "connected" && (
            <div
              style={{
                marginTop: 15,
              }}
            >
              {/* Brightness */}
              {(device.type ===
                "light" ||
                device.type ===
                  "tv" ||
                device.type ===
                  "custom") && (
                <label>
                  Brightness :{" "}
                  {
                    device.state
                      ?.brightness
                  }
                  %
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={
                      device.state
                        ?.brightness ||
                      0
                    }
                    onChange={(e) =>
                      updateDeviceState(
                        device._id,
                        {
                          brightness:
                            Number(
                              e
                                .target
                                .value
                            ),
                        }
                      )
                    }
                  />
                </label>
              )}

              {/* Temperature */}
              {device.type ===
                "ac" && (
                <label>
                  Temperature :{" "}
                  {
                    device.state
                      ?.temperature
                  }
                  °C
                  <input
                    type="range"
                    min="16"
                    max="30"
                    value={
                      device.state
                        ?.temperature ||
                      16
                    }
                    onChange={(e) =>
                      updateDeviceState(
                        device._id,
                        {
                          temperature:
                            Number(
                              e
                                .target
                                .value
                            ),
                        }
                      )
                    }
                  />
                </label>
              )}

              {/* Volume */}
              {(device.type ===
                "speaker" ||
                device.type ===
                  "tv") && (
                <label>
                  Volume :{" "}
                  {
                    device.state
                      ?.volume
                  }
                  %
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={
                      device.state
                        ?.volume ||
                      0
                    }
                    onChange={(e) =>
                      updateDeviceState(
                        device._id,
                        {
                          volume:
                            Number(
                              e
                                .target
                                .value
                            ),
                        }
                      )
                    }
                  />
                </label>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  </Panel>
);
}


const SkillsPanel = ({ token, skills, setSkills }) => {
    const [name, setName] = useState("");
    const [phrases, setPhrases] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const addSkill = async (event) => {
        event.preventDefault();
        const data = await apiRequest("/api/skills", {
            method: "POST",
            body: JSON.stringify({
                name,
                description: "Custom NANNA skill",
                triggerPhrases: phrases.split(",").map((phrase) => phrase.trim()).filter(Boolean),
                endpoint,
            }),
        }, token);
        setSkills([data.skill, ...skills]);
        setName("");
        setPhrases("");
        setEndpoint("");
    };
    return (<Panel icon={<Wand2 size={21}/>} title="Skills System" subtitle="Alexa-like hot-swappable plugin records with trigger phrases and optional API endpoints.">
      <form onSubmit={addSkill} style={{ display: "grid", gap: 10 }}>
        <input style={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Skill name, e.g. Fitness Coach"/>
        <input style={styles.input} value={phrases} onChange={(event) => setPhrases(event.target.value)} placeholder="Trigger phrases separated by commas"/>
        <input style={styles.input} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="Optional webhook endpoint"/>
        <button type="submit" style={{ ...styles.button, width: 150 }}><Plus size={18}/> Add Skill</button>
      </form>
      <Grid>
        {skills.map((skill) => (<MiniCard key={skill._id}>
            <h3 style={{ margin: 0 }}>{skill.name}</h3>
            <div style={{ color: colors.muted, marginTop: 7 }}>{skill.triggerPhrases.join(", ") || "No triggers yet"}</div>
            <div style={{ color: skill.enabled ? colors.mint : colors.danger, marginTop: 10, fontWeight: 850 }}>{skill.enabled ? "Enabled" : "Disabled"}</div>
          </MiniCard>))}
      </Grid>
    </Panel>);
};
const RoutinesPanel = ({ token, routines, devices, refresh }) => {
    const { isMobile } = useViewport();
    const [name, setName] = useState("Good morning");
    const [triggerPhrase, setTriggerPhrase] = useState("good morning");
    const [deviceName, setDeviceName] = useState("");
    const createRoutine = async (event) => {
        event.preventDefault();
        await apiRequest("/api/routines", {
            method: "POST",
            body: JSON.stringify({
                name,
                triggerPhrase,
                actions: [
                    ...(deviceName ? [{ type: "device", payload: { deviceName, power: true } }] : []),
                    { type: "say", payload: { text: "Good morning. Your routine is complete." } },
                ],
            }),
        }, token);
        await refresh();
    };
    const runRoutine = async (id) => {
        await apiRequest(`/api/routines/${id}/run`, { method: "POST" }, token);
        await refresh();
    };
    return (<Panel icon={<Zap size={21}/>} title="Routines & Automation" subtitle='Example: "Good morning" turns on lights and returns a spoken response.'>
      <form onSubmit={createRoutine} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 120px", gap: 10 }}>
        <input style={styles.input} value={name} onChange={(event) => setName(event.target.value)}/>
        <input style={styles.input} value={triggerPhrase} onChange={(event) => setTriggerPhrase(event.target.value)}/>
        <select
  style={styles.input}
  value={deviceName}
  onChange={(event) => setDeviceName(event.target.value)}
>
  <option value="">No device</option>

  {(devices || []).map((device) => (
    <option key={device._id} value={device.name}>
      {device.name}
    </option>
  ))}
</select>
        <button type="submit" style={styles.button}>Create</button>
      </form>
      <Grid>
  {(routines || []).map((routine) => (
    <MiniCard
      key={routine._id}
      style={{
        padding: 20,
        border: "1px solid rgba(255,255,255,0.08)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            ⚡ {routine.name}
          </h3>

          <div
            style={{
              color: colors.muted,
              fontSize: 13,
              marginTop: 5,
            }}
          >
            Trigger: "{routine.triggerPhrase}"
          </div>
        </div>

        <span
          style={{
            background: routine.enabled
              ? "#22c55e22"
              : "#ef444422",
            color: routine.enabled
              ? "#22c55e"
              : "#ef4444",
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 12,
          }}
        >
          {routine.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 15,
        }}
      >
        {(routine.actions || []).map((action, index) => (
          <span
            key={index}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              fontSize: 12,
            }}
          >
            {action.type}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
        }}
      >
        <button
          type="button"
          style={styles.button}
          onClick={() => runRoutine(routine._id)}
        >
          ▶ Run
        </button>

        <button
          type="button"
          style={styles.ghostButton}
        >
          ✏ Edit
        </button>

        <button
          type="button"
          style={{
            ...styles.ghostButton,
            color: "#ef4444",
          }}
        >
          🗑 Delete
        </button>
      </div>
    </MiniCard>
  ))}
</Grid>
    </Panel>);
};
const ProductivityPanel = ({ token, tasks, setTasks, reminders, setReminders, alarms, setAlarms }) => {
    const [taskTitle, setTaskTitle] = useState("");
    const [reminderTitle, setReminderTitle] = useState("");
    const [remindAt, setRemindAt] = useState("");
    const [reminderChannel, setReminderChannel] = useState("in_app");
    const [alertLabel, setAlertLabel] = useState("NANNA timer");
    const [alertAt, setAlertAt] = useState("");
    const [timerSeconds, setTimerSeconds] = useState("300");
    const [alertType, setAlertType] = useState("timer");
    const createTask = async (event) => {
        event.preventDefault();
        const data = await apiRequest("/api/tasks", { method: "POST", body: JSON.stringify({ title: taskTitle }) }, token);
        setTasks([data.task, ...tasks]);
        setTaskTitle("");
    };
    const createReminder = async (event) => {
        event.preventDefault();
        const data = await apiRequest("/api/reminders", { method: "POST", body: JSON.stringify({ title: reminderTitle, remindAt: toIso(remindAt), channel: reminderChannel }) }, token);
        setReminders([...reminders, data.reminder]);
        setReminderTitle("");
        setRemindAt("");
    };
    const createAlarm = async (event) => {
        event.preventDefault();
        const payload = alertType === "timer"
            ? { type: alertType, label: alertLabel, durationSeconds: Number(timerSeconds) }
            : { type: alertType, label: alertLabel, triggerAt: toIso(alertAt) };
        const data = await apiRequest("/api/alarms", { method: "POST", body: JSON.stringify(payload) }, token);
        setAlarms([...alarms, data.alarm]);
        if (alertType === "alarm")
            setAlertAt("");
    };
    return (<Panel icon={<ListTodo size={21}/>} title="Productivity" subtitle="Tasks, reminders, alarms, timers, and calendar-ready records.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <MiniCard>
          <h3 style={{ marginTop: 0 }}>To-do Lists</h3>
          <form onSubmit={createTask} style={{ display: "flex", gap: 8 }}>
            <input style={styles.input} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task"/>
            <button style={styles.button}><Plus size={18}/></button>
          </form>
          {tasks.slice(0, 5).map((task) => <Row key={task._id} text={task.title} meta={task.status}/>)}
        </MiniCard>
        <MiniCard>
          <h3 style={{ marginTop: 0 }}>Reminders</h3>
          <form onSubmit={createReminder} style={{ display: "grid", gap: 8 }}>
            <input style={styles.input} value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder="Reminder"/>
            <input style={styles.input} type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)}/>
            <select style={styles.input} value={reminderChannel} onChange={(event) => setReminderChannel(event.target.value)}>
              <option value="in_app">In app</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="telegram">Telegram</option>
            </select>
            <button style={styles.button}>Schedule</button>
          </form>
          {reminders.slice(0, 4).map((reminder) => <Row key={reminder._id} text={reminder.title} meta={formatDate(reminder.remindAt)}/>)}
        </MiniCard>
        <MiniCard>
          <h3 style={{ marginTop: 0 }}>Alarms & Timers</h3>
          <form onSubmit={createAlarm} style={{ display: "grid", gap: 8 }}>
            <select style={styles.input} value={alertType} onChange={(event) => setAlertType(event.target.value)}>
              <option value="timer">Timer</option>
              <option value="alarm">Alarm</option>
            </select>
            <input style={styles.input} value={alertLabel} onChange={(event) => setAlertLabel(event.target.value)}/>
            {alertType === "timer" ? (<input style={styles.input} type="number" min={1} value={timerSeconds} onChange={(event) => setTimerSeconds(event.target.value)} placeholder="Seconds"/>) : (<input style={styles.input} type="datetime-local" value={alertAt} onChange={(event) => setAlertAt(event.target.value)}/>)}
            <button style={styles.button}>Set</button>
          </form>
          {alarms.slice(0, 4).map((alarm) => <Row key={alarm._id} text={`${alarm.type}: ${alarm.label}`} meta={formatDate(alarm.triggerAt)}/>)}
        </MiniCard>
      </div>
    </Panel>);
};
const ProfilePanel = ({ token, user, onUserChange }) => {

  const [name, setName] = useState(user.name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [telegramChatId, setTelegramChatId] = useState(user.telegramChatId || "");
  const [timezone, setTimezone] = useState(user.timezone || "Asia/Kolkata");
  const [communicationStyle, setCommunicationStyle] = useState(
    user.preferences?.communicationStyle || "friendly"
  );
  const [voiceEnabled, setVoiceEnabled] = useState(
    Boolean(user.preferences?.voiceEnabled)
  );
  const [saved, setSaved] = useState("");

  const saveProfile = async (event) => {
    event.preventDefault();

    const data = await apiRequest(
      "/api/users/profile",
      {
        method: "PUT",
        body: JSON.stringify({
          name,
          phone,
          telegramChatId,
          timezone,
          preferences: {
            assistantName: "NANNA",
            communicationStyle,
            voiceEnabled,
          },
        }),
      },
      token
    );

    onUserChange(token, data.user);
    setSaved("Profile saved.");
  };

  return (
    <>
      <Panel
        icon={<UserRound size={21} />}
        title="Privacy, Profile & Voice Settings"
        subtitle="Control personal data, microphone preference, voice history, and assistant behavior."
      >
        <form
          onSubmit={saveProfile}
          style={{
            display: "grid",
            gap: 14,
            maxWidth: 780,
          }}
        >
          <Field
            label="Name"
            value={name}
            onChange={setName}
          />

          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
          />

          <Field
            label="Telegram Chat ID"
            value={telegramChatId}
            onChange={setTelegramChatId}
          />

          <Field
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
          />

          <label style={styles.label}>
            Communication Style
            <select
              style={styles.input}
              value={communicationStyle}
              onChange={(e) =>
                setCommunicationStyle(e.target.value)
              }
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="concise">Concise</option>
            </select>
          </label>

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) =>
                setVoiceEnabled(e.target.checked)
              }
            />
            Enable voice profile mode
          </label>

          {saved && (
            <div style={{ color: "lime" }}>
              {saved}
            </div>
          )}

          <button
            type="submit"
            style={styles.button}
          >
            Save Profile
          </button>
        </form>
      </Panel>

    </>
  );
};


const AmbientParticles = () => (<div className="ambient-particles" aria-hidden="true">
    {Array.from({ length: 44 }, (_, index) => (<span key={index} className="particle" style={{
            left: `${(index * 37) % 100}%`,
            animationDelay: `${(index % 13) * -0.7}s`,
            animationDuration: `${10 + (index % 9)}s`,
        }}/>))}
  </div>);
const BootScreen = () => {
    const coreRef = useRef(null);
    useEffect(() => {
        if (!coreRef.current)
            return;
        const timeline = gsap.timeline();
        timeline
            .fromTo(coreRef.current, { opacity: 0, y: 22, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.75, ease: "power3.out" })
            .fromTo(".boot-ring", { filter: "blur(10px)" }, { filter: "blur(0px)", duration: 0.5 }, "-=0.35")
            .fromTo(".boot-bars span", { scaleY: 0.2, opacity: 0.25 }, { scaleY: 1, opacity: 1, stagger: 0.015, duration: 0.45 }, "-=0.25");
        return () => {
            timeline.kill();
        };
    }, []);
    return (<motion.div className="boot-screen" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03 }} transition={{ duration: 0.65, ease: "easeInOut" }}>
      <div className="boot-core" ref={coreRef}>
        <div className="boot-ring"/>
        <div style={{ color: colors.muted, fontSize: 12, fontWeight: 950, letterSpacing: 0 }}>
          AI LIFE OS
        </div>
        <h1 style={{ margin: "8px 0 0", fontSize: 42 }}>NANNA AI initializing...</h1>
        <p style={{ color: colors.soft, margin: "10px auto 0", maxWidth: 460, lineHeight: 1.6 }}>
          Calibrating voice, memory, automations, notifications, and spatial command surfaces.
        </p>
        <div className="boot-bars">
          {Array.from({ length: 28 }, (_, index) => (<span key={index} style={{ animationDelay: `${index * 0.04}s` }}/>))}
        </div>
      </div>
    </motion.div>);
};
const NannaAvatar3D = ({ compact = false, mood = "ready", isSpeaking = false, speechText = "", }) => {
    const activeSpeaking = isSpeaking || mood === "speaking";
    return (<div className={compact ? "nanna-avatar-3d compact" : "nanna-avatar-3d"} aria-label="NANNA 3D AI assistant model">
      <AvatarCanvas isListening={mood === "listening"} isSpeaking={activeSpeaking} mood={mood} speechText={speechText} modelUrl={null}/>
    </div>);
    const mountRef = useRef(null);
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount)
            return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        camera.position.set(0, compact ? 0.25 : 0.12, compact ? 6.1 : 5.7);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        mount.appendChild(renderer.domElement);
        const avatar = new THREE.Group();
        scene.add(avatar);
        const skin = new THREE.MeshStandardMaterial({ color: 0xffc9b7, roughness: 0.48, metalness: 0.03 });
        const hair = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.72, metalness: 0.04 });
        const suit = new THREE.MeshStandardMaterial({ color: 0x263a72, roughness: 0.38, metalness: 0.18 });
        const glow = new THREE.MeshStandardMaterial({
            color: mood === "listening" ? 0x7cf2c3 : mood === "thinking" ? 0x9a8cff : 0x50e6ff,
            emissive: mood === "listening" ? 0x2ff3b7 : mood === "thinking" ? 0x725cff : 0x15bce8,
            emissiveIntensity: compact ? 0.55 : 0.82,
            roughness: 0.25,
            metalness: 0.22,
        });
        const white = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.28, metalness: 0.02 });
        const iris = new THREE.MeshStandardMaterial({ color: 0x16c7ee, emissive: 0x074e77, emissiveIntensity: 0.45, roughness: 0.22 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.5 });
        const lip = new THREE.MeshStandardMaterial({ color: 0xff7ab8, roughness: 0.44 });
        const blush = new THREE.MeshStandardMaterial({ color: 0xff9fbf, transparent: true, opacity: 0.56, roughness: 0.6 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.68, 0.9, 8, 20), suit);
        body.position.y = -1.25;
        body.scale.set(1.05, 1.1, 0.72);
        avatar.add(body);
        const chestCore = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), glow);
        chestCore.position.set(0, -0.92, 0.56);
        avatar.add(chestCore);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 52, Math.PI), glow);
        collar.position.set(0, -0.62, 0.42);
        collar.rotation.x = Math.PI;
        avatar.add(collar);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 24), skin);
        neck.position.y = -0.46;
        avatar.add(neck);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.68, 42, 42), skin);
        head.position.y = 0.24;
        head.scale.set(0.92, 1.05, 0.88);
        avatar.add(head);
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.72, 42, 42, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
        hairCap.position.set(0, 0.52, -0.03);
        hairCap.scale.set(0.98, 0.84, 0.94);
        avatar.add(hairCap);
        const ponytail = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.86, 8, 18), hair);
        ponytail.position.set(0.52, -0.04, -0.38);
        ponytail.rotation.z = -0.32;
        avatar.add(ponytail);
        const sideLockLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.72, 8, 18), hair);
        sideLockLeft.position.set(-0.52, 0.06, 0.28);
        sideLockLeft.rotation.z = 0.2;
        const sideLockRight = sideLockLeft.clone();
        sideLockRight.position.x = 0.52;
        sideLockRight.rotation.z = -0.2;
        avatar.add(sideLockLeft, sideLockRight);
        const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.58, 24), hair);
        fringe.position.set(-0.28, 0.68, 0.42);
        fringe.rotation.z = 0.52;
        fringe.rotation.x = -0.3;
        avatar.add(fringe);
        const eyeWhiteLeft = new THREE.Mesh(new THREE.SphereGeometry(0.142, 24, 24), white);
        eyeWhiteLeft.position.set(-0.23, 0.31, 0.58);
        eyeWhiteLeft.scale.set(0.78, 1.12, 0.22);
        const eyeWhiteRight = eyeWhiteLeft.clone();
        eyeWhiteRight.position.x = 0.23;
        avatar.add(eyeWhiteLeft, eyeWhiteRight);
        const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.082, 22, 22), iris);
        eyeLeft.position.set(-0.23, 0.3, 0.625);
        eyeLeft.scale.set(0.78, 1.08, 0.18);
        const eyeRight = eyeLeft.clone();
        eyeRight.position.x = 0.23;
        avatar.add(eyeLeft, eyeRight);
        const pupilLeft = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 18), dark);
        pupilLeft.position.set(-0.23, 0.292, 0.653);
        pupilLeft.scale.set(0.82, 1.1, 0.16);
        const pupilRight = pupilLeft.clone();
        pupilRight.position.x = 0.23;
        avatar.add(pupilLeft, pupilRight);
        const eyeGlowLeft = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 14), glow);
        eyeGlowLeft.position.set(-0.205, 0.345, 0.673);
        const eyeGlowRight = eyeGlowLeft.clone();
        eyeGlowRight.position.x = 0.255;
        avatar.add(eyeGlowLeft, eyeGlowRight);
        const cheekLeft = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 18), blush);
        cheekLeft.position.set(-0.36, 0.08, 0.59);
        cheekLeft.scale.set(1.4, 0.48, 0.12);
        const cheekRight = cheekLeft.clone();
        cheekRight.position.x = 0.36;
        avatar.add(cheekLeft, cheekRight);
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.013, 8, 28, Math.PI), lip);
        mouth.position.set(0, -0.05, 0.62);
        mouth.rotation.x = Math.PI;
        avatar.add(mouth);
        const armLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.72, 8, 18), skin);
        armLeft.position.set(-0.72, -1.08, 0.08);
        armLeft.rotation.z = 0.24;
        const armRight = armLeft.clone();
        armRight.position.x = 0.72;
        armRight.rotation.z = -0.24;
        avatar.add(armLeft, armRight);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.012, 8, 96), glow);
        halo.position.y = 0.02;
        halo.rotation.x = Math.PI / 2.65;
        avatar.add(halo);
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.008, 8, 112), glow);
        orbit.rotation.set(Math.PI / 2.15, 0.45, 0.15);
        avatar.add(orbit);
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(3.5, 4.2, 4.8);
        scene.add(key);
        const fill = new THREE.PointLight(0x50e6ff, mood === "listening" ? 2.2 : 1.35, 7);
        fill.position.set(-2.2, 1.6, 3.4);
        scene.add(fill);
        scene.add(new THREE.AmbientLight(0xffffff, 1.15));
        const resize = () => {
            const rect = mount.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        resize();
        const pointer = new THREE.Vector2(0, 0);
        const look = new THREE.Vector2(0, 0);
        const onPointerMove = (event) => {
            const rect = mount.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            pointer.x = THREE.MathUtils.clamp((event.clientX - centerX) / Math.max(rect.width, 1), -1, 1);
            pointer.y = THREE.MathUtils.clamp((event.clientY - centerY) / Math.max(rect.height, 1), -1, 1);
        };
        window.addEventListener("pointermove", onPointerMove);
        let frame = 0;
        let running = true;
        const render = () => {
            if (!running)
                return;
            frame += 0.016;
            look.lerp(pointer, 0.08);
            avatar.rotation.y = Math.sin(frame * 0.7) * 0.12 + look.x * 0.42;
            avatar.rotation.x = -look.y * 0.16;
            avatar.position.y = Math.sin(frame * (mood === "thinking" ? 2.2 : 1.4)) * 0.05;
            const eyeShiftX = look.x * 0.035;
            const eyeShiftY = -look.y * 0.02;
            eyeLeft.position.x = -0.23 + eyeShiftX;
            eyeRight.position.x = 0.23 + eyeShiftX;
            pupilLeft.position.x = -0.23 + eyeShiftX * 1.35;
            pupilRight.position.x = 0.23 + eyeShiftX * 1.35;
            eyeGlowLeft.position.x = -0.205 + eyeShiftX * 1.6;
            eyeGlowRight.position.x = 0.255 + eyeShiftX * 1.6;
            eyeLeft.position.y = 0.3 + eyeShiftY;
            eyeRight.position.y = 0.3 + eyeShiftY;
            pupilLeft.position.y = 0.292 + eyeShiftY * 1.2;
            pupilRight.position.y = 0.292 + eyeShiftY * 1.2;
            eyeGlowLeft.position.y = 0.345 + eyeShiftY * 1.35;
            eyeGlowRight.position.y = 0.345 + eyeShiftY * 1.35;
            ponytail.rotation.z = -0.32 + Math.sin(frame * 1.3) * 0.035 - look.x * 0.05;
            halo.rotation.z += mood === "thinking" ? 0.018 : 0.008;
            orbit.rotation.z -= mood === "listening" ? 0.016 : 0.009;
            chestCore.scale.setScalar(1 + Math.sin(frame * 5.2) * (mood === "listening" ? 0.14 : 0.07));
            renderer.render(scene, camera);
            window.requestAnimationFrame(render);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        render();
        return () => {
            running = false;
            observer.disconnect();
            window.removeEventListener("pointermove", onPointerMove);
            mount.removeChild(renderer.domElement);
            renderer.dispose();
            scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    object.geometry.dispose();
                    const material = object.material;
                    if (Array.isArray(material))
                        material.forEach((item) => item.dispose());
                    else
                        material.dispose();
                }
            });
        };
    }, [compact, mood]);
    return <div ref={mountRef} className={compact ? "nanna-avatar-3d compact" : "nanna-avatar-3d"} aria-label="NANNA 3D AI assistant model"/>;
};
const Brand = ({ compact = false }) => (<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <div className="brand-avatar-shell" style={{
        width: compact ? 48 : 56,
        height: compact ? 48 : 56,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, #4de7ff, #ff7bbd)",
        color: "#071018",
        overflow: "hidden",
    }}>
      <NannaAvatar3D compact mood="ready"/>
    </div>
    {!compact && (<div>
        <div style={{ color: colors.muted, fontWeight: 850, fontSize: 12 }}>AI VOICE OS</div>
        <h1 style={{ margin: 0, fontSize: 46 }}>NANNA</h1>
      </div>)}
  </div>);
const FeatureGrid = () => (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
    {[
        ["Wake Word", "Say Nanna"],
        ["Smart Home", "MQTT/REST ready"],
        ["Skills", "Plugin architecture"],
        ["Voice", "ASR + TTS"],
    ].map(([title, text]) => (<MiniCard key={title}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ color: colors.muted, marginTop: 6 }}>{text}</div>
      </MiniCard>))}
  </div>);
const Panel = ({ icon, title, subtitle, children }) => (<div className="app-panel" style={{ ...styles.card, padding: 18 }}>
    <PanelTitle icon={icon} title={title} subtitle={subtitle}/>
    {children}
  </div>);
const PanelTitle = ({ icon, title, subtitle }) => (<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
    <div style={{ width: 42, height: 42, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(77,231,255,0.12)", border: `1px solid ${colors.line}`, color: colors.cyan }}>{icon}</div>
    <div>
      <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
      <div style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</div>
    </div>
  </div>);
const NavItem = ({ active, icon, label, onClick }) => (<button type="button" onClick={onClick} style={{ width: "100%", border: 0, borderRadius: 8, padding: "12px 11px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: active ? colors.text : colors.muted, background: active ? "linear-gradient(135deg, rgba(77,231,255,0.22), rgba(255,123,189,0.18))" : "transparent", fontWeight: 850, textAlign: "left" }}>
    {icon}
    {label}
  </button>);
const CopilotChip = ({ icon, label, onClick }) => (<button type="button" onClick={onClick} style={{
        ...styles.ghostButton,
        justifyContent: "flex-start",
        background: "linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
        borderColor: colors.lineStrong,
    }}>
    {icon}
    {label}
  </button>);
const StatusPill = ({ label, value, tone }) => (<div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        padding: "7px 9px",
        background: "rgba(255,255,255,0.065)",
        color: colors.soft,
        fontSize: 12,
        fontWeight: 900,
    }}>
    <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, boxShadow: `0 0 18px ${tone}` }}/>
    <span style={{ color: colors.muted }}>{label}</span>
    {value}
  </div>);
const FloatingPanel = ({ title, icon, children }) => (<div className="floating-panel" style={{
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        padding: 14,
        background: "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
        backdropFilter: "blur(22px)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.24)",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, fontWeight: 950 }}>
      <span style={{ color: colors.cyan }}>{icon}</span>
      {title}
    </div>
    {children}
  </div>);
const channelStatus = (jobs, type) => {
    const job = jobs.find((item) => item.type === type);
    if (!job)
        return "ready";
    if (job.status === "completed")
        return "sent";
    if (job.status === "failed")
        return "failed";
    return "queued";
};
const integrationStatus = (integration, jobs, type) => {
    if (!integration)
        return channelStatus(jobs, type);
    if (!integration.configured)
        return "needs keys";
    if (type === "telegram" && integration.healthy === false)
        return "token issue";
    if (type === "telegram" && integration.webhookConfigured === false)
        return "webhook off";
    return channelStatus(jobs, type);
};
const integrationDetail = (integration) => {
    if (!integration)
        return "Checking provider";
    if (integration.healthy === false && integration.message)
        return integration.message;
    if (integration.configured)
        if (integration.provider === "telegram_bot" && integration.webhookConfigured === false)
            return "Bot token connected. Set TELEGRAM_WEBHOOK_URL, then use /api/telegram/setup-webhook.";
    if (integration.configured)
        return integration.healthy === true
            ? `${integration.provider} connected`
            : `${integration.provider} configured`;
    return `Missing ${integration.requiredEnv.join(", ")}`;
};
const ChannelRow = ({ label, detail, status, tone }) => (<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${colors.line}` }}>
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: tone }}/>
        {label}
      </div>
      <div style={{ color: colors.muted, fontSize: 12, marginTop: 3, overflowWrap: "anywhere" }}>{detail}</div>
    </div>
    <span style={{ color: tone, fontSize: 12, fontWeight: 950, border: `1px solid ${colors.line}`, borderRadius: 8, padding: "5px 7px", background: "rgba(0,0,0,0.16)" }}>{status}</span>
  </div>);
const WorkflowCanvas = ({ jobs }) => {
    const nodes = jobs.length
        ? jobs
        : [
            { _id: "listen", type: "custom", status: "completed", payload: { label: "Listen" } },
            { _id: "think", type: "custom", status: "queued", payload: { label: "Think" } },
            { _id: "act", type: "custom", status: "queued", payload: { label: "Act" } },
        ];
    return (<div style={{
            position: "relative",
            minHeight: 210,
            border: `1px solid ${colors.line}`,
            borderRadius: 8,
            background: "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), rgba(0,0,0,0.18)",
            backgroundSize: "32px 32px",
            overflow: "hidden",
        }}>
      <div style={{ position: "absolute", left: 22, right: 22, top: 44, height: 1, background: "linear-gradient(90deg, transparent, rgba(80,230,255,0.45), rgba(255,122,184,0.35), transparent)" }}/>
      {nodes.map((job, index) => (<div key={job._id} style={{
                position: "absolute",
                left: `${8 + (index % 2) * 48}%`,
                top: `${18 + index * 30}px`,
                width: 112,
                minHeight: 58,
                borderRadius: 8,
                padding: 10,
                border: `1px solid ${colors.line}`,
                background: job.status === "completed"
                    ? "linear-gradient(135deg, rgba(124,242,195,0.18), rgba(255,255,255,0.06))"
                    : "linear-gradient(135deg, rgba(154,140,255,0.14), rgba(255,255,255,0.06))",
                boxShadow: "0 14px 32px rgba(0,0,0,0.24)",
            }}>
          <div style={{ fontWeight: 950, textTransform: "capitalize" }}>{String(job.payload.label || job.type)}</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>{job.status}</div>
        </div>))}
    </div>);
};
const StatCard = ({ label, value, tone }) => (<div className="stat-card" style={{ border: `1px solid ${colors.line}`, background: "rgba(255,255,255,0.045)", borderRadius: 8, padding: 12 }}>
    <div style={{ color: colors.muted, fontSize: 12, fontWeight: 850 }}>{label}</div>
    <div style={{ color: tone, fontSize: 25, fontWeight: 950 }}>{value}</div>
  </div>);
const MiniCard = ({ children }) => (<div className="mini-card" style={{ border: `1px solid ${colors.line}`, borderRadius: 8, padding: 14, background: "rgba(255,255,255,0.045)" }}>{children}</div>);
const Grid = ({ children }) => (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>{children}</div>);
const Field = ({ label, value, onChange, placeholder = "", type = "text" }) => (<label style={styles.label}>
    {label}
    <input style={styles.input} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/>
  </label>);
const Alert = ({ children }) => (<div style={{ border: "1px solid rgba(255,100,124,0.35)", background: "rgba(255,100,124,0.1)", color: "#ffd0d8", borderRadius: 8, padding: 12, marginBottom: 12 }}>{children}</div>);
const EmptyState = ({ icon, title, text }) => (<div style={{ margin: "auto", textAlign: "center", color: colors.muted, maxWidth: 520, lineHeight: 1.6 }}>
    {icon}
    <h3 style={{ color: colors.text, margin: "12px 0 6px" }}>{title}</h3>
    {text}
  </div>);
const Row = ({ text, meta }) => (<div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 10, marginTop: 10 }}>
    <div style={{ fontWeight: 850 }}>{text}</div>
    <div style={{ color: colors.muted, fontSize: 12 }}>{meta}</div>
  </div>);

export default App;
