import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  RotateCcw,
  X,
  CheckSquare,
  Sparkles,
  Award,
  Clock,
  Square,
  ChevronRight,
} from "lucide-react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { format } from "date-fns";
import toast from "react-hot-toast";

export interface Subtask {
  title: string;
  done: boolean;
  estimatedMinutes?: number;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  category: string;
  subtasks?: Subtask[];
  estimatedMinutes?: number;
}

interface FocusModeContextType {
  startFocusSession: (task: Task) => void;
  activeTask: Task | null;
  isOpen: boolean;
  closeFocusSession: () => void;
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(
  undefined,
);

export function useFocusMode() {
  const context = useContext(FocusModeContext);
  if (context === undefined) {
    throw new Error("useFocusMode must be used within a FocusModeProvider");
  }
  return context;
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const startFocusSession = (task: Task) => {
    setActiveTask(task);
    setIsOpen(true);
  };

  const closeFocusSession = () => {
    setActiveTask(null);
    setIsOpen(false);
  };

  return (
    <FocusModeContext.Provider
      value={{ startFocusSession, activeTask, isOpen, closeFocusSession }}
    >
      {children}
      <AnimatePresence>
        {isOpen && activeTask && (
          <FocusModeOverlay task={activeTask} onClose={closeFocusSession} />
        )}
      </AnimatePresence>
    </FocusModeContext.Provider>
  );
}

// Custom particle background (30 particles, moving slowly)
function FocusParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: { x: number; y: number; vx: number; vy: number }[] = [];
    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", resize);
    resize();

    // init 30 particles
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(167, 139, 250, 0.25)";

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
  );
}

// Chime using Web Audio API
const playCompletionChime = () => {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 528;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  } catch (err) {
    console.warn("Audio chime failed to play:", err);
  }
};

interface FocusModeOverlayProps {
  task: Task;
  onClose: () => void;
}

function FocusModeOverlay({ task, onClose }: FocusModeOverlayProps) {
  const { currentUser, updateProfileStats } = useAuth();

  // Timer settings & states
  const [mode, setMode] = useState<"pomodoro" | "deepwork" | "custom">(
    "pomodoro",
  );
  const [sessionType, setSessionType] = useState<"work" | "break">("work");
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [customWorkMinutes, setCustomWorkMinutes] = useState(50);
  const [customBreakMinutes, setCustomBreakMinutes] = useState(10);

  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [totalTimeExpected, setTotalTimeExpected] = useState(25 * 60);
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(true);

  // Statistics
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);

  // Subtask Checklist states
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks || []);

  // UI Modals
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [praiseText, setPraiseText] = useState("");
  const [loadingPraise, setLoadingPraise] = useState(false);

  // Prevent scroll on mount
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Document Title update
  useEffect(() => {
    const originalTitle = document.title;
    if (!isCompleted) {
      const mins = Math.floor(timeLeft / 60)
        .toString()
        .padStart(2, "0");
      const secs = (timeLeft % 60).toString().padStart(2, "0");
      const label = sessionType === "work" ? "Focus" : "Break";
      document.title = `${mins}:${secs} — ${label} | FlowMind`;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [timeLeft, sessionType, isCompleted]);

  // Synchronise outer task's subtasks if updated
  useEffect(() => {
    setSubtasks(task.subtasks || []);
  }, [task]);

  // Timer Tick implementation
  useEffect(() => {
    if (!isStarted || isPaused || isCompleted) return;

    const interval = setInterval(() => {
      if (timeLeft > 0) {
        setTimeLeft((prev) => prev - 1);
        if (sessionType === "work") {
          setTotalFocusSeconds((prev) => prev + 1);
        }
      } else {
        playCompletionChime();

        if (sessionType === "work") {
          if (mode === "pomodoro") {
            setSessionType("break");
            setTimeLeft(breakDuration * 60);
            setTotalTimeExpected(breakDuration * 60);
            toast.success("Pomodoro completed! Time for a short break! ☕");
          } else if (breakDuration > 0) {
            setSessionType("break");
            setTimeLeft(breakDuration * 60);
            setTotalTimeExpected(breakDuration * 60);
            toast.success("Focus block complete! Enjoy your break! 🧘");
          } else {
            setIsPaused(true);
            toast.success("Focus block completed! Outstanding work!");
          }
        } else {
          setSessionType("work");
          setTimeLeft(workDuration * 60);
          setTotalTimeExpected(workDuration * 60);
          setPomodorosCompleted((prev) => prev + 1);
          toast.success("Break finished! Ready to dive back in? ⚡");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isStarted,
    isPaused,
    timeLeft,
    sessionType,
    mode,
    workDuration,
    breakDuration,
    isCompleted,
  ]);

  // Handle Mode Change
  const handleSelectMode = (newMode: "pomodoro" | "deepwork" | "custom") => {
    if (isStarted) return;
    setMode(newMode);
    if (newMode === "pomodoro") {
      setWorkDuration(25);
      setBreakDuration(5);
      setTimeLeft(25 * 60);
      setTotalTimeExpected(25 * 60);
    } else if (newMode === "deepwork") {
      setWorkDuration(90);
      setBreakDuration(15);
      setTimeLeft(90 * 60);
      setTotalTimeExpected(90 * 60);
    } else if (newMode === "custom") {
      setWorkDuration(customWorkMinutes);
      setBreakDuration(customBreakMinutes);
      setTimeLeft(customWorkMinutes * 60);
      setTotalTimeExpected(customWorkMinutes * 60);
    }
  };

  // Adjust Custom Work duration
  const handleCustomWorkChange = (val: number) => {
    const clamped = Math.max(1, Math.min(180, val));
    setCustomWorkMinutes(clamped);
    if (mode === "custom" && !isStarted) {
      setWorkDuration(clamped);
      setTimeLeft(clamped * 60);
      setTotalTimeExpected(clamped * 60);
    }
  };

  // Adjust Custom Break duration
  const handleCustomBreakChange = (val: number) => {
    const clamped = Math.max(0, Math.min(60, val));
    setCustomBreakMinutes(clamped);
    if (mode === "custom" && !isStarted) {
      setBreakDuration(clamped);
    }
  };

  // Reset Session Timer
  const handleReset = () => {
    setIsPaused(true);
    setIsStarted(false);
    setSessionType("work");
    setTotalFocusSeconds(0);
    setPomodorosCompleted(0);

    if (mode === "pomodoro") {
      setTimeLeft(25 * 60);
      setTotalTimeExpected(25 * 60);
    } else if (mode === "deepwork") {
      setTimeLeft(90 * 60);
      setTotalTimeExpected(90 * 60);
    } else {
      setTimeLeft(customWorkMinutes * 60);
      setTotalTimeExpected(customWorkMinutes * 60);
    }
  };

  // Toggle active Play/Pause state
  const handleTogglePlay = () => {
    if (!isStarted) {
      setIsStarted(true);
    }
    setIsPaused(!isPaused);
  };

  // End Session Click
  const handleEndSessionClick = () => {
    if (totalFocusSeconds === 0) {
      onClose();
    } else {
      setIsConfirmingEnd(true);
    }
  };

  // End Session and Save Stats
  const handleCompleteSession = async () => {
    setIsConfirmingEnd(false);
    setIsCompleted(true);
    setIsPaused(true);

    const elapsedMinutes = Math.round(totalFocusSeconds / 60);

    if (elapsedMinutes > 0) {
      // 1. Update stats total focus minutes in context (takes care of firestore too)
      await updateProfileStats(elapsedMinutes);

      // 2. Add record to focus_sessions collection
      try {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        await addDoc(collection(db, "focus_sessions"), {
          userId: currentUser?.uid,
          date: todayStr,
          minutes: elapsedMinutes,
          category: task.category || "personal",
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to log session record in focus_sessions:", err);
      }
    }

    // 3. Fetch AI Praise celebrating work completed
    setLoadingPraise(true);
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `The user just completed an active deep focus session.
Task: "${task.title}"
Duration focused: ${elapsedMinutes} minutes
Pomodoros completed: ${pomodorosCompleted}
Subtasks: ${subtasks.filter((s) => s.done).length}/${subtasks.length} done

Write a short, inspiring, personal one-sentence praise celebrating their effort. Keep it under 20 words and write with genuine, encouraging warmth.`,
        }),
      });
      const data = await response.json();
      if (data.text) {
        setPraiseText(data.text.trim().replace(/^"|"$/g, ""));
      } else {
        setPraiseText(
          "Fantastic work! You've maintained pristine focus, moving closer to mastering your agenda.",
        );
      }
    } catch (err) {
      console.warn("Failed to call Gemini API for praise:", err);
      setPraiseText(
        "Incredible job! Every focused minute builds positive momentum toward your objectives.",
      );
    } finally {
      setLoadingPraise(false);
    }
  };

  // Check off a subtask inline and persist
  const handleToggleSubtask = async (index: number) => {
    const nextSubtasks = subtasks.map((sub, i) =>
      i === index ? { ...sub, done: !sub.done } : sub,
    );
    setSubtasks(nextSubtasks);

    if (currentUser) {
      // 1. Update localStorage cache
      const cacheKey = `local_tasks_${currentUser.uid}`;
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        try {
          const cachedTasks = JSON.parse(cachedStr);
          const updatedTasks = cachedTasks.map((t: any) =>
            t.id === task.id ? { ...t, subtasks: nextSubtasks } : t,
          );
          localStorage.setItem(cacheKey, JSON.stringify(updatedTasks));
        } catch (err) {
          console.warn("Failed to update local cache of task subtasks", err);
        }
      }

      // 2. Sync to Firestore
      try {
        if (!task.id.startsWith("task_local_")) {
          await updateDoc(doc(db, "tasks", task.id), {
            subtasks: nextSubtasks,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn("Failed to update subtasks in firestore:", err);
      }
    }
  };

  // Calculations for Timer Circle SVG
  const radius = 90;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const ratio = timeLeft / Math.max(1, totalTimeExpected);
  const strokeDashoffset = circumference * (1 - ratio);

  // Time formatting
  const formattedMinutes = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const formattedSeconds = (timeLeft % 60).toString().padStart(2, "0");

  // Subtasks progress calculations
  const subtasksTotal = subtasks.length;
  const subtasksDone = subtasks.filter((s) => s.done).length;
  const progressPercent =
    subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  // Circle stroke color depending on remaining ratio
  const getCircleColor = () => {
    if (ratio > 0.5) return "stroke-emerald-400 text-emerald-400";
    if (ratio >= 0.2) return "stroke-amber-500 text-amber-500";
    return "stroke-rose-500 text-rose-500";
  };

  const portalContent = (
    <div
      id="focus-mode-portal-overlay"
      className="fixed inset-0 z-[9999] overflow-y-auto font-sans text-white flex flex-col focus-animated-gradient"
    >
      {/* Dynamic Style Block to load Google Fonts and animated gradient keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Outfit:wght@400;500;600&display=swap');
        
        @keyframes focusGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .focus-animated-gradient {
          background: linear-gradient(-45deg, #1e1b4b, #2e1065, #020617, #111827);
          background-size: 400% 400%;
          animation: focusGradient 12s ease infinite;
        }
        .font-syne {
          font-family: 'Syne', sans-serif;
        }
        .font-outfit {
          font-family: 'Outfit', sans-serif;
        }
      `}</style>

      {/* Slower particle canvas background */}
      <FocusParticleBackground />

      {/* Main Container */}
      <div className="relative w-full max-w-[600px] mx-auto px-6 py-8 flex-1 flex flex-col justify-between z-10 font-outfit min-h-screen">
        {/* State A: Running Session Screen */}
        {!isCompleted ? (
          <>
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <span className="text-xxs font-mono uppercase tracking-widest text-violet-300">
                  Currently Focusing On
                </span>
                <h2
                  className="text-xl md:text-2xl font-bold tracking-tight text-white font-syne truncate"
                  title={task.title}
                >
                  {task.title}
                </h2>
              </div>
              <button
                id="btn-end-session"
                onClick={handleEndSessionClick}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition text-xs font-medium border border-white/15"
              >
                End Session
              </button>
            </div>

            {/* Middle Section: Circle Timer */}
            <div className="my-auto py-8 flex flex-col items-center">
              <div className="relative w-64 h-64 flex items-center justify-center">
                {/* SVG Radial Progress */}
                <svg className="w-full h-full rotate-[-90deg]">
                  {/* Track circle */}
                  <circle
                    cx="128"
                    cy="128"
                    r={radius}
                    className="stroke-white/5 fill-transparent"
                    strokeWidth={strokeWidth}
                  />
                  {/* Active animated countdown circle */}
                  <circle
                    cx="128"
                    cy="128"
                    r={radius}
                    className={`fill-transparent transition-all duration-300 ${getCircleColor()}`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Inner countdown numbers */}
                <div className="absolute text-center">
                  <span
                    className={`text-5xl font-bold font-mono tracking-tight block transition-colors duration-300 ${getCircleColor()}`}
                  >
                    {formattedMinutes}:{formattedSeconds}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-violet-300 mt-1 block">
                    {sessionType === "work" ? "deep focus" : "break time"}
                  </span>
                </div>
              </div>

              {/* Mode Settings Selector (Shown only before timer starts) */}
              {!isStarted ? (
                <div className="mt-8 w-full flex flex-col items-center gap-4">
                  <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-full gap-1">
                    <button
                      id="mode-pomodoro"
                      onClick={() => handleSelectMode("pomodoro")}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                        mode === "pomodoro"
                          ? "bg-violet-600 text-white shadow-md"
                          : "text-violet-200 hover:text-white"
                      }`}
                    >
                      Pomodoro
                    </button>
                    <button
                      id="mode-deepwork"
                      onClick={() => handleSelectMode("deepwork")}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                        mode === "deepwork"
                          ? "bg-violet-600 text-white shadow-md"
                          : "text-violet-200 hover:text-white"
                      }`}
                    >
                      Deep Work
                    </button>
                    <button
                      id="mode-custom"
                      onClick={() => handleSelectMode("custom")}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                        mode === "custom"
                          ? "bg-violet-600 text-white shadow-md"
                          : "text-violet-200 hover:text-white"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {/* Custom configuration inputs */}
                  {mode === "custom" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-4 items-center bg-white/5 border border-white/10 p-3 rounded-2xl"
                    >
                      <div className="text-center">
                        <label className="block text-[10px] uppercase font-mono text-violet-300 mb-1">
                          Work
                        </label>
                        <input
                          type="number"
                          value={customWorkMinutes}
                          onChange={(e) =>
                            handleCustomWorkChange(
                              parseInt(e.target.value) || 1,
                            )
                          }
                          className="w-16 bg-white/10 border border-white/15 px-2 py-1 rounded text-center text-sm focus:outline-none focus:border-violet-400"
                        />
                      </div>
                      <div className="text-center">
                        <label className="block text-[10px] uppercase font-mono text-violet-300 mb-1">
                          Break
                        </label>
                        <input
                          type="number"
                          value={customBreakMinutes}
                          onChange={(e) =>
                            handleCustomBreakChange(
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-16 bg-white/10 border border-white/15 px-2 py-1 rounded text-center text-sm focus:outline-none focus:border-violet-400"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                /* Stats and streak counters during run */
                <div className="mt-6 flex gap-6 text-xs text-violet-300">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Focus: {Math.floor(totalFocusSeconds / 60)}m
                  </span>
                  {mode === "pomodoro" && (
                    <span className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      Completed: {pomodorosCompleted}
                    </span>
                  )}
                </div>
              )}

              {/* Core Timer Controls (Large centered buttons) */}
              <div className="mt-8 flex items-center gap-4">
                <button
                  id="btn-timer-reset"
                  onClick={handleReset}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition hover:scale-105 active:scale-95 border border-white/15 text-white"
                  title="Reset timer"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  id="btn-timer-toggle"
                  onClick={handleTogglePlay}
                  className="p-5 rounded-full bg-violet-600 hover:bg-violet-500 transition hover:scale-110 active:scale-95 border border-violet-400 shadow-lg shadow-violet-900/30 text-white"
                >
                  {isPaused ? (
                    <Play className="w-8 h-8 fill-white ml-1" />
                  ) : (
                    <Pause className="w-8 h-8 fill-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Checklist Column (Below timer) */}
            <div className="mt-auto w-full max-h-[350px] bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-sm font-bold font-syne flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-violet-300" />
                  Task Subtasks Checklist
                </h3>
                {subtasksTotal > 0 && (
                  <span className="text-[10px] font-mono text-violet-300">
                    {subtasksDone}/{subtasksTotal} ({progressPercent}%)
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              {subtasksTotal > 0 && (
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-violet-400 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              )}

              {/* Subtask checkboxes list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {subtasksTotal > 0 ? (
                  subtasks.map((sub, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleToggleSubtask(idx)}
                      className="flex items-center gap-3 bg-white/5 border border-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10 transition"
                    >
                      <button
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          sub.done
                            ? "bg-violet-500 border-violet-400"
                            : "border-white/35 hover:border-white/50"
                        }`}
                      >
                        {sub.done && (
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-scale" />
                        )}
                      </button>
                      <span
                        className={`text-xs select-none truncate ${sub.done ? "line-through text-white/40" : "text-white/80"}`}
                      >
                        {sub.title}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-white/40 italic">
                    No subtasks currently structured. Focus entirely on the main
                    title target!
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* State B: Summary Screen (After ending focus session) */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="my-auto py-8 text-center flex flex-col items-center justify-center bg-white/5 border border-white/10 p-8 rounded-3xl"
          >
            <div className="w-16 h-16 rounded-full bg-violet-600/30 border border-violet-400 flex items-center justify-center mb-6">
              <Award className="w-8 h-8 text-violet-300" />
            </div>

            <h2 className="text-3xl font-bold font-syne text-white mb-2">
              Session Completed!
            </h2>
            <p className="text-xs font-mono text-violet-300 tracking-wider uppercase mb-6">
              {task.title}
            </p>

            {/* AI generated coaching praise block */}
            <div className="min-h-[80px] flex items-center justify-center px-4 py-3 bg-white/5 border border-white/5 rounded-2xl mb-8 w-full">
              {loadingPraise ? (
                <div className="flex items-center gap-2 text-violet-300 text-xs">
                  <Sparkles className="w-4 h-4 animate-spin" />
                  Generating coach feedback...
                </div>
              ) : (
                <p className="text-sm italic text-violet-200 font-medium">
                  "{praiseText}"
                </p>
              )}
            </div>

            {/* Complete statistics cards block */}
            <div className="grid grid-cols-3 gap-3.5 w-full mb-8">
              <div className="bg-white/5 border border-white/5 p-4 rounded-xl text-center">
                <span className="block text-[10px] font-mono text-violet-300 uppercase tracking-widest mb-1.5">
                  Time Focused
                </span>
                <span className="text-xl font-bold font-syne text-white">
                  {Math.round(totalFocusSeconds / 60)}m
                </span>
              </div>
              <div className="bg-white/5 border border-white/5 p-4 rounded-xl text-center">
                <span className="block text-[10px] font-mono text-violet-300 uppercase tracking-widest mb-1.5">
                  Pomodoros
                </span>
                <span className="text-xl font-bold font-syne text-white">
                  {pomodorosCompleted}
                </span>
              </div>
              <div className="bg-white/5 border border-white/5 p-4 rounded-xl text-center">
                <span className="block text-[10px] font-mono text-violet-300 uppercase tracking-widest mb-1.5">
                  Subtasks Done
                </span>
                <span className="text-xl font-bold font-syne text-white">
                  {subtasksDone}/{subtasksTotal}
                </span>
              </div>
            </div>

            {/* CTA action button */}
            <button
              id="btn-summary-done"
              onClick={onClose}
              className="w-full py-3 rounded-full bg-violet-600 hover:bg-violet-500 font-semibold text-sm tracking-wide transition shadow-lg shadow-violet-900/30 hover:scale-[1.02] active:scale-[0.98] border border-violet-400"
            >
              Back to Dashboard
            </button>
          </motion.div>
        )}
      </div>

      {/* State C: Confirmation Modal */}
      <AnimatePresence>
        {isConfirmingEnd && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[400px] bg-[#12121e] border border-white/10 p-6 rounded-2xl text-center shadow-2xl font-outfit"
            >
              <h3 className="text-lg font-bold font-syne text-white mb-2">
                End Focus Session?
              </h3>
              <p className="text-xs text-white/75 mb-6">
                Are you sure you want to end your focus time? We will save all
                your accumulated focus minutes and subtask accomplishments.
              </p>
              <div className="flex gap-3">
                <button
                  id="btn-confirm-cancel"
                  onClick={() => setIsConfirmingEnd(false)}
                  className="flex-1 py-2.5 rounded-full bg-white/5 hover:bg-white/10 transition border border-white/10 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-end"
                  onClick={handleCompleteSession}
                  className="flex-1 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 transition border border-violet-400 text-xs font-semibold text-white shadow-md"
                >
                  Yes, End Session
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  return createPortal(portalContent, document.body);
}
