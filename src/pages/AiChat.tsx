import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  onSnapshot,
  orderBy,
  deleteDoc,
} from "firebase/firestore";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Calendar,
  Check,
  ChevronLeft,
  X,
  Loader2,
  Sparkles,
  CheckSquare,
  MessageSquare,
  User,
  Clock,
  MessageCircle,
  HelpCircle,
} from "lucide-react";
import { askGeminiChat } from "../lib/gemini";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";

interface ChatBlock {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string; // Cleaned text for display
  originalContent: string; // Raw text (with [TASK_CREATE...] commands)
  timestamp: string;
  taskCommand?: {
    title: string;
    dueDate: string;
    priority: "critical" | "high" | "medium" | "low";
    category: "study" | "work" | "personal" | "finance" | "health";
    status: "pending" | "added" | "dismissed";
  } | null;
  scheduleCommand?: {
    blocks: ChatBlock[];
    status: "pending" | "saved" | "dismissed";
  } | null;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  userId: string;
  createdAt: any;
  updatedAt: any;
}

const SYSTEM_PROMPT = `You are Flow, an AI productivity companion inside FlowMind. You help users manage tasks, plan their days, prepare for deadlines, and stay motivated. Be concise, warm, and action-oriented. Use bullet points for lists. Keep responses under 150 words unless the user asks for detail.

Special commands you can output:
- To create a task: include [TASK_CREATE:{"title":"...","dueDate":"YYYY-MM-DD","priority":"high|medium|low","category":"study|work|personal"}] in your response
- To suggest a schedule: include [SCHEDULE:{"blocks":[{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"}]}] in your response`;

export default function AiChat() {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingSessions, setFetchingSessions] = useState(true);

  // Responsive / Mobile View state
  const [showHistoryMobile, setShowHistoryMobile] = useState(true);

  // Speech input / Speech synthesis state
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Parse task and schedule commands from response text
  const parseMessageCommands = (
    text: string,
  ): {
    cleanText: string;
    taskCommand: ChatMessage["taskCommand"];
    scheduleCommand: ChatMessage["scheduleCommand"];
  } => {
    let cleanText = text;
    let taskCommand: ChatMessage["taskCommand"] = null;
    let scheduleCommand: ChatMessage["scheduleCommand"] = null;

    // Regex for TASK_CREATE
    const taskMatch = text.match(/\[TASK_CREATE:(\{[\s\S]*?\})\]/);
    if (taskMatch) {
      try {
        const parsed = JSON.parse(taskMatch[1]);
        taskCommand = {
          title: parsed.title,
          dueDate: parsed.dueDate || format(new Date(), "yyyy-MM-dd"),
          priority: (parsed.priority || "medium").toLowerCase() as any,
          category: (parsed.category || "personal").toLowerCase() as any,
          status: "pending",
        };
        // Clean out of display text
        cleanText = cleanText
          .replace(/\[TASK_CREATE:\{[\s\S]*?\}\]/g, "")
          .trim();
      } catch (e) {
        console.error("Failed to parse TASK_CREATE command:", e);
      }
    }

    // Regex for SCHEDULE
    const scheduleMatch = text.match(/\[SCHEDULE:(\{[\s\S]*?\})\]/);
    if (scheduleMatch) {
      try {
        const parsed = JSON.parse(scheduleMatch[1]);
        scheduleCommand = {
          blocks: parsed.blocks || [],
          status: "pending",
        };
        // Clean out of display text
        cleanText = cleanText.replace(/\[SCHEDULE:\{[\s\S]*?\}\]/g, "").trim();
      } catch (e) {
        console.error("Failed to parse SCHEDULE command:", e);
      }
    }

    return { cleanText, taskCommand, scheduleCommand };
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat sessions
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "conversations", currentUser.uid, "chats"),
      orderBy("updatedAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: ChatSession[] = [];
      snapshot.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() } as ChatSession);
      });
      setSessions(loaded);
      setFetchingSessions(false);

      // Select first chat if none active
      if (loaded.length > 0 && !currentSessionId) {
        setCurrentSessionId(loaded[0].id);
        setMessages(loaded[0].messages || []);
        setShowHistoryMobile(false);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Load active session messages when currentSessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    const sess = sessions.find((s) => s.id === currentSessionId);
    if (sess) {
      setMessages(sess.messages || []);
    }
  }, [currentSessionId, sessions]);

  // Web Speech API: Voice Recognition initialization
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        const resultText = event.results[0][0].transcript;
        if (resultText) {
          setInputText(resultText);
          toast.success("Voice transcribed! Press Send to submit.");
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        setIsListening(false);
        if (e.error === "not-allowed") {
          toast.error(
            "Microphone access denied. Please allow microphone permissions.",
          );
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, []);

  const handleToggleListening = () => {
    if (!recognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
        toast.success("Listening... Speak clearly.");
      } catch (err) {
        console.error("Failed to start SpeechRecognition:", err);
      }
    }
  };

  // Text to Speech
  const handleToggleSpeak = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => setSpeakingMsgId(null);
      utterance.onerror = () => setSpeakingMsgId(null);
      setSpeakingMsgId(msgId);
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Fetch tasks in real-time context
  const fetchTaskContext = async (): Promise<string> => {
    if (!currentUser) return "";
    try {
      const q = query(
        collection(db, "tasks"),
        where("userId", "==", currentUser.uid),
      );
      const querySnapshot = await getDocs(q);
      const activeTasks: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status !== "done" && data.deleted !== true) {
          activeTasks.push(data);
        }
      });

      const taskCount = activeTasks.length;
      let urgentTaskTitle = "None";
      let urgentTaskDue = "N/A";

      const tasksWithDates = activeTasks
        .filter((t) => t.dueDate)
        .sort(
          (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        );

      if (tasksWithDates.length > 0) {
        urgentTaskTitle = tasksWithDates[0].title;
        urgentTaskDue = tasksWithDates[0].dueDate;
      }

      const todayStr = format(new Date(), "yyyy-MM-dd");
      return `\n\n[Context: User has ${taskCount} tasks. Most urgent: '${urgentTaskTitle}' due ${urgentTaskDue}. Today is ${todayStr}.]`;
    } catch (e) {
      console.error("Context fetch failed:", e);
      return "";
    }
  };

  // Handle Send Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !currentUser) return;

    setInputText("");
    setLoading(true);

    let activeSessionId = currentSessionId;
    let currentSessionMessages = [...messages];

    // 1. Create a session if none is selected or available
    if (!activeSessionId) {
      // First 5 words of message as title
      const words = text.split(" ").slice(0, 5).join(" ");
      const title = words + (text.split(" ").length > 5 ? "..." : "");

      try {
        const sessRef = await addDoc(
          collection(db, "conversations", currentUser.uid, "chats"),
          {
            title,
            userId: currentUser.uid,
            messages: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        );
        activeSessionId = sessRef.id;
        setCurrentSessionId(sessRef.id);
      } catch (err) {
        console.error("Failed to create chat session:", err);
        toast.error("Failed to start new chat.");
        setLoading(false);
        return;
      }
    }

    // 2. Add user message
    const userMsg: ChatMessage = {
      id: "msg_user_" + Math.random().toString(36).substring(2, 11),
      role: "user",
      content: text,
      originalContent: text,
      timestamp: format(new Date(), "hh:mm a"),
    };

    const nextMessages = [...currentSessionMessages, userMsg];
    setMessages(nextMessages);
    setShowHistoryMobile(false);

    try {
      // Fetch tasks context (hidden context)
      const hiddenContext = await fetchTaskContext();
      const rawUserPromptWithContext = text + hiddenContext;

      // Slice last 10 messages for multireturn chat history context
      const historyMessages = nextMessages.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.originalContent }],
      }));

      // Set user message as last in contents list
      const contentsPayload = [
        ...historyMessages.slice(0, -1),
        { role: "user", parts: [{ text: rawUserPromptWithContext }] },
      ];

      // Request API
      const responseText = await askGeminiChat(contentsPayload, SYSTEM_PROMPT);

      // Parse response commands
      const { cleanText, taskCommand, scheduleCommand } =
        parseMessageCommands(responseText);

      const assistantMsg: ChatMessage = {
        id: "msg_ai_" + Math.random().toString(36).substring(2, 11),
        role: "model",
        content: cleanText,
        originalContent: responseText,
        timestamp: format(new Date(), "hh:mm a"),
        taskCommand,
        scheduleCommand,
      };

      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);

      // Save back to Firestore
      const chatDocRef = doc(
        db,
        "conversations",
        currentUser.uid,
        "chats",
        activeSessionId,
      );
      await updateDoc(chatDocRef, {
        messages: finalMessages,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Chat generation failed:", err);
      toast.error("Flow is currently overloaded. Please try again!");
    } finally {
      setLoading(false);
    }
  };

  // Start a fresh, clean chat session
  const handleNewChat = async () => {
    if (!currentUser) return;
    setCurrentSessionId(null);
    setMessages([]);
    setShowHistoryMobile(false);
    toast.success("New chat initialized. Ask Flow anything!");
  };

  // Delete chat session
  const handleDeleteSession = async (e: React.MouseEvent, sessId: string) => {
    e.stopPropagation();
    if (!currentUser) return;

    if (confirm("Are you sure you want to delete this conversation?")) {
      try {
        await deleteDoc(
          doc(db, "conversations", currentUser.uid, "chats", sessId),
        );
        toast.success("Chat deleted");
        if (currentSessionId === sessId) {
          setCurrentSessionId(null);
          setMessages([]);
          setShowHistoryMobile(true);
        }
      } catch (err) {
        console.error("Failed to delete chat:", err);
        toast.error("Failed to delete conversation.");
      }
    }
  };

  // Create task action from card
  const handleCreateTaskFromCard = async (msgId: string) => {
    if (!currentUser || !currentSessionId) return;

    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg || !targetMsg.taskCommand) return;

    const { title, dueDate, priority, category } = targetMsg.taskCommand;

    try {
      await addDoc(collection(db, "tasks"), {
        userId: currentUser.uid,
        title,
        dueDate,
        priority,
        category,
        status: "todo",
        isAIGenerated: true,
        deleted: false,
        createdAt: serverTimestamp(),
      });

      toast.success("✨ Task added directly to your Board!");

      // Mark status as added in local list
      const nextMessages = messages.map((m) => {
        if (m.id === msgId && m.taskCommand) {
          return {
            ...m,
            taskCommand: { ...m.taskCommand, status: "added" as const },
          };
        }
        return m;
      });

      setMessages(nextMessages);
      await updateDoc(
        doc(db, "conversations", currentUser.uid, "chats", currentSessionId),
        {
          messages: nextMessages,
        },
      );
    } catch (err) {
      console.error("Task creation from card failed:", err);
      toast.error("Could not save task.");
    }
  };

  // Dismiss task card
  const handleDismissTaskCard = async (msgId: string) => {
    if (!currentUser || !currentSessionId) return;

    const nextMessages = messages.map((m) => {
      if (m.id === msgId && m.taskCommand) {
        return {
          ...m,
          taskCommand: { ...m.taskCommand, status: "dismissed" as const },
        };
      }
      return m;
    });

    setMessages(nextMessages);
    await updateDoc(
      doc(db, "conversations", currentUser.uid, "chats", currentSessionId),
      {
        messages: nextMessages,
      },
    );
    toast.success("Action card dismissed.");
  };

  // Save schedule blocks to calendar
  const handleSaveScheduleFromCard = async (msgId: string) => {
    if (!currentUser || !currentSessionId) return;

    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg || !targetMsg.scheduleCommand) return;

    const blocks = targetMsg.scheduleCommand.blocks;

    try {
      // Save blocks sequentially to calendar/schedule collection
      const promises = blocks.map((b) =>
        addDoc(collection(db, "schedule"), {
          userId: currentUser.uid,
          title: b.title,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          createdAt: serverTimestamp(),
        }),
      );

      await Promise.all(promises);
      toast.success("📅 All slots booked and synchronized to Calendar!");

      // Update message state
      const nextMessages = messages.map((m) => {
        if (m.id === msgId && m.scheduleCommand) {
          return {
            ...m,
            scheduleCommand: { ...m.scheduleCommand, status: "saved" as const },
          };
        }
        return m;
      });

      setMessages(nextMessages);
      await updateDoc(
        doc(db, "conversations", currentUser.uid, "chats", currentSessionId),
        {
          messages: nextMessages,
        },
      );
    } catch (err) {
      console.error("Save schedule error:", err);
      toast.error("Could not fully save schedule blocks.");
    }
  };

  // Dismiss schedule card
  const handleDismissScheduleCard = async (msgId: string) => {
    if (!currentUser || !currentSessionId) return;

    const nextMessages = messages.map((m) => {
      if (m.id === msgId && m.scheduleCommand) {
        return {
          ...m,
          scheduleCommand: {
            ...m.scheduleCommand,
            status: "dismissed" as const,
          },
        };
      }
      return m;
    });

    setMessages(nextMessages);
    await updateDoc(
      doc(db, "conversations", currentUser.uid, "chats", currentSessionId),
      {
        messages: nextMessages,
      },
    );
    toast.success("Schedule offer dismissed.");
  };

  // Suggestions Chip Handlers
  const handleSuggestionClick = (promptText: string) => {
    handleSendMessage(promptText);
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-140px)] flex bg-card rounded-2xl border border-surface overflow-hidden shadow-xl">
      {/* SIDEBAR - CHAT HISTORY */}
      <div
        className={`w-[260px] border-r border-surface bg-surface flex flex-col shrink-0 transition-transform ${
          showHistoryMobile
            ? "translate-x-0 absolute inset-y-0 left-0 z-20 w-full sm:w-[260px] sm:relative"
            : "hidden sm:flex"
        }`}
      >
        {/* Header with New Chat */}
        <div className="p-4 border-b border-surface flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm tracking-wider uppercase text-muted font-display">
              Conversations
            </h3>
            {showHistoryMobile && (
              <button
                onClick={() => setShowHistoryMobile(false)}
                className="sm:hidden p-1 bg-card hover:bg-card/80 border border-surface rounded text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-[0_4px_10px_rgba(124,110,240,0.2)] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Scrollable list of past conversations */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {fetchingSessions ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-xxs text-muted">Loading history...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-xxs text-muted px-4">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30 text-primary" />
              No past chats. Start a new session above!
            </div>
          ) : (
            sessions.map((sess) => {
              const isActive = sess.id === currentSessionId;
              const dateStr = sess.updatedAt?.seconds
                ? format(
                    new Date(sess.updatedAt.seconds * 1000),
                    "MMM dd, hh:mm a",
                  )
                : format(new Date(), "MMM dd");

              return (
                <div
                  key={sess.id}
                  onClick={() => {
                    setCurrentSessionId(sess.id);
                    setShowHistoryMobile(false);
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center justify-between gap-3 group cursor-pointer transition-all border ${
                    isActive
                      ? "bg-primary/10 border-primary/20 text-primary font-semibold"
                      : "border-transparent text-text hover:bg-card"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MessageCircle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? "text-primary" : "text-muted"}`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs truncate">
                        {sess.title || "Chat session"}
                      </p>
                      <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {dateStr}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSession(e, sess.id)}
                    className="p-1 hover:bg-danger/10 hover:text-danger rounded text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MAIN CHAT WORKSPACE */}
      <div className="flex-1 flex flex-col bg-background relative min-w-0">
        {/* TOP BAR */}
        <div className="px-6 py-4 border-b border-surface flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle button on mobile */}
            <button
              onClick={() => setShowHistoryMobile(true)}
              className="sm:hidden p-2 bg-surface hover:bg-surface/80 border border-surface rounded-xl text-muted hover:text-text cursor-pointer shrink-0"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner">
              <Bot className="w-5 h-5 text-primary" strokeWidth={1.5} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-text font-display">Flow</h2>
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0 shadow-[0_0_8px_#22c55e]"></span>
              </div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-muted">AI Productivity Coach</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface border border-white/5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-muted shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
            Adaptive Context Active
          </div>
        </div>

        {/* MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !loading ? (
            /* EMPTY STATE: PROMPT CHIPS */
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-8">
              <div className="w-20 h-20 bg-primary/5 border border-primary/20 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(124,110,240,0.1)]">
                <Bot className="w-10 h-10 text-primary" strokeWidth={1.5} />
              </div>

              <div className="space-y-3">
                <h3 className="text-2xl font-bold font-display text-text">
                  Consult Flow Mindset
                </h3>
                <p className="text-[13px] text-muted max-w-sm mx-auto leading-relaxed">
                  Meet Flow, your dedicated cognitive task planner. Draft
                  agendas, schedule blocks, or structure tasks in real-time.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {[
                  { text: "📋 Plan my day", val: "Plan my day" },
                  {
                    text: "🎯 I have an interview tomorrow",
                    val: "I have an interview tomorrow",
                  },
                  {
                    text: "⚡ What's my most urgent task?",
                    val: "What's my most urgent task?",
                  },
                  { text: "🧘 Help me focus", val: "Help me focus" },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(chip.val)}
                    className="px-5 py-4 premium-card text-left text-[13px] text-text flex items-center gap-3 group font-medium cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-primary rotate-180 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
                    {chip.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, index) => {
                const isAI = msg.role === "model";
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
                    key={msg.id}
                    className={`flex items-start gap-4 ${isAI ? "justify-start" : "justify-end"}`}
                  >
                    {/* Avatar */}
                    {isAI && (
                      <div className="w-9 h-9 rounded-full bg-card border border-surface flex items-center justify-center shrink-0 shadow-md">
                         <Bot className="w-5 h-5 text-primary" strokeWidth={1.5} />
                      </div>
                    )}

                    <div className="max-w-[85%] sm:max-w-[70%] space-y-2">
                      {/* Message Bubble */}
                      <div
                        className={`p-5 rounded-2xl relative border ${
                          isAI
                            ? "bg-card border-surface border-l-[3px] border-l-primary text-text shadow-sm"
                            : "bg-primary border-primary text-white shadow-md rounded-tr-sm"
                        }`}
                      >
                        {/* Markdown Text */}
                        <div className="prose prose-invert prose-xs max-w-none text-[13px] leading-relaxed whitespace-pre-line">
                          {isAI ? (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>

                        {/* Footer info & Speak button */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5 text-[10px] uppercase font-bold tracking-widest text-muted">
                          <span>{msg.timestamp}</span>

                          {isAI && (
                            <button
                              onClick={() =>
                                handleToggleSpeak(msg.id, msg.content)
                              }
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                                speakingMsgId === msg.id
                                  ? "bg-danger/10 border-danger/20 text-danger animate-pulse"
                                  : "bg-background border-surface hover:border-white/10 text-text"
                              }`}
                            >
                              {speakingMsgId === msg.id ? (
                                <>
                                  <VolumeX className="w-3 h-3" />
                                  Stop
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3 h-3 text-primary" />
                                  Speak
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* SPECIAL ACTION CARD: TASK CREATION */}
                      {isAI &&
                        msg.taskCommand &&
                        msg.taskCommand.status === "pending" && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card border-2 border-primary/20 rounded-2xl p-5 shadow-xl space-y-4"
                          >
                            <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest">
                              <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
                              Flow Action Offer
                            </div>

                            <div className="p-4 bg-background border border-surface rounded-xl shadow-inner">
                              <p className="section-eyebrow">
                                Task Proposal
                              </p>
                              <h4 className="font-bold text-[13px] text-text mt-1.5">
                                {msg.taskCommand.title}
                              </h4>

                              <div className="flex flex-wrap gap-2 mt-3">
                                <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                  Due: {msg.taskCommand.dueDate}
                                </span>
                                <span className="text-[10px] font-bold bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                  Priority: {msg.taskCommand.priority}
                                </span>
                                <span className="text-[10px] font-bold bg-surface text-text border border-white/5 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                  {msg.taskCommand.category}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCreateTaskFromCard(msg.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md hover:-translate-y-0.5"
                              >
                                <CheckSquare className="w-4 h-4" />
                                Add to Tasks
                              </button>
                              <button
                                onClick={() => handleDismissTaskCard(msg.id)}
                                className="px-4 py-2.5 bg-surface hover:bg-surface/80 border border-surface rounded-xl text-[11px] font-bold uppercase tracking-widest text-text hover:border-white/10 transition-all cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          </motion.div>
                        )}

                      {isAI &&
                        msg.taskCommand &&
                        msg.taskCommand.status === "added" && (
                          <div className="bg-success/5 border border-success/20 rounded-xl p-3 text-center text-xs font-bold text-success flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" strokeWidth={2} />
                            <span>
                              Task successfully saved to Productivity Board!
                            </span>
                          </div>
                        )}

                      {/* SPECIAL ACTION CARD: SCHEDULE */}
                      {isAI &&
                        msg.scheduleCommand &&
                        msg.scheduleCommand.status === "pending" && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card border-2 border-accent/20 rounded-2xl p-5 shadow-xl space-y-4"
                          >
                            <div className="flex items-center gap-2 text-accent font-bold text-[10px] uppercase tracking-widest">
                              <Calendar className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
                              Flow Schedule Builder
                            </div>

                            <div className="p-4 bg-background border border-surface rounded-xl shadow-inner space-y-3 max-h-48 overflow-y-auto">
                              <p className="section-eyebrow">
                                Suggested Agenda Slots
                              </p>
                              {msg.scheduleCommand.blocks.map((block, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="text-[13px] border-b border-white/5 pb-3 last:border-0 last:pb-0"
                                >
                                  <p className="font-bold text-text">
                                    {block.title}
                                  </p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted mt-1">
                                    {block.date} | {block.startTime} -{" "}
                                    {block.endTime}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  handleSaveScheduleFromCard(msg.id)
                                }
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent text-card text-[11px] font-bold uppercase tracking-widest rounded-xl hover:opacity-90 transition-all cursor-pointer shadow-[0_4px_12px_rgba(240,165,0,0.2)] hover:-translate-y-0.5"
                              >
                                <Calendar className="w-4 h-4" />
                                Save to Calendar
                              </button>
                              <button
                                onClick={() =>
                                  handleDismissScheduleCard(msg.id)
                                }
                                className="px-4 py-2.5 bg-surface hover:bg-surface/80 border border-surface rounded-xl text-[11px] font-bold uppercase tracking-widest text-text hover:border-white/10 transition-all cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          </motion.div>
                        )}

                      {isAI &&
                        msg.scheduleCommand &&
                        msg.scheduleCommand.status === "saved" && (
                          <div className="bg-success/5 border border-success/20 rounded-xl p-3 text-center text-xs font-bold text-success flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" strokeWidth={2} />
                            <span>
                              Schedule blocks successfully booked onto Calendar!
                            </span>
                          </div>
                        )}
                    </div>

                    {/* User Avatar */}
                    {!isAI && (
                      <div className="w-9 h-9 rounded-full bg-surface border border-surface flex items-center justify-center shrink-0 shadow-sm">
                        <User className="w-4 h-4 text-text" strokeWidth={1.5} />
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Loader/Thinking indicator */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-4"
                >
                  <div className="w-9 h-9 rounded-full bg-card border border-surface flex items-center justify-center shrink-0 shadow-md">
                     <Bot className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  </div>
                  <div className="bg-card border-l-[3px] border-l-primary border border-surface p-5 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="p-4 bg-background border-t border-surface flex flex-col gap-2 relative">
          {/* Audio recording status strip */}
          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -top-12 left-4 right-4 bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger animate-ping shrink-0 shadow-[0_0_8px_#ef4444]"></span>
                  <span className="text-[13px] font-medium">Listening... Speak your prompt now.</span>
                </div>
                <button
                  onClick={handleToggleListening}
                  className="font-bold uppercase tracking-widest text-[10px] bg-danger text-white px-3 py-1 rounded-lg"
                >
                  Stop
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 max-w-4xl mx-auto w-full">
            {/* Microphone Button */}
            <button
              onClick={handleToggleListening}
              disabled={!recognition}
              className={`p-3.5 border rounded-2xl transition-all shadow-sm ${!recognition ? "opacity-50 cursor-not-allowed bg-surface border-surface text-muted" : "cursor-pointer"} ${
                isListening
                  ? "bg-danger/20 border-danger/40 text-danger animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  : "bg-surface/50 border-white/5 hover:border-white/10 text-muted hover:text-text hover:bg-surface"
              }`}
              title={!recognition ? "Voice input not supported in this browser" : "Speak message"}
            >
              {isListening ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5 text-primary" strokeWidth={1.5} />
              )}
            </button>

            {/* Main input field */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder={isListening ? "Listening..." : "Message Flow..."}
                disabled={loading}
                className="w-full bg-surface/50 border border-white/5 rounded-2xl pl-5 pr-14 py-4 text-[13px] text-text placeholder-muted focus:outline-none focus:border-primary/50 transition-all focus:bg-background shadow-inner"
              />
              
              {/* Send Button Inside Input */}
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputText.trim()}
                className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-white rounded-xl shadow-[0_4px_12px_rgba(124,110,240,0.3)] transition-all cursor-pointer"
              >
                <Send className="w-4 h-4 ml-0.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
