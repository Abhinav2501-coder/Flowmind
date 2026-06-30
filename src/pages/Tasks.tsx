import { useState, useEffect, useRef, useMemo } from "react";
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
} from "firebase/firestore";
import {
  format,
  isToday,
  isTomorrow,
  isPast,
  isThisWeek,
  addDays,
  differenceInDays,
  parseISO,
  formatDistanceToNow,
} from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckSquare,
  Sparkles,
  Clock,
  Plus,
  Trash2,
  Edit3,
  MoreVertical,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  Search,
  Send,
  CheckCircle,
  Circle,
  Layers,
  List,
  CalendarDays,
  Bot,
  HelpCircle,
  Copy,
  TrendingUp,
  X,
  Loader2,
  ChevronRight,
  User,
} from "lucide-react";
import { askGeminiJSON, askGemini } from "../lib/gemini";
import toast from "react-hot-toast";
import { parseDueDate } from "./Dashboard";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useFocusMode } from "../components/FocusMode";

type Priority = "critical" | "high" | "medium" | "low";
type Category = "study" | "work" | "personal" | "finance" | "health";
type TaskStatus = "todo" | "in-progress" | "done";

interface Subtask {
  title: string;
  estimatedMinutes?: number;
  done: boolean;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate: any;
  priority: Priority;
  category: Category;
  estimatedMinutes?: number;
  subtasks?: Subtask[];
  status: TaskStatus;
  isAIGenerated?: boolean;
  deleted?: boolean;
  createdAt: any;
  updatedAt?: any;
}

interface RePrioritizeItem {
  id: string;
  newPriority: Priority;
  reason: string;
}

export default function Tasks() {
  const { currentUser } = useAuth();
  const { startFocusSession } = useFocusMode();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "board" | "timeline">(
    "list",
  );

  // New task inputs
  const [taskInput, setTaskInput] = useState("");
  const [isAIPlanning, setIsAIPlanning] = useState(false);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterTime, setFilterTime] = useState<string>("all"); // 'all', 'today', 'overdue', 'week'
  const [sortBy, setSortBy] = useState<
    "dueDate" | "priority" | "createdAt" | "alphabetical"
  >("dueDate");

  // Detail Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [loadingAiAnswer, setLoadingAiAnswer] = useState(false);

  // Prioritization Modal State
  const [prioritizeModalOpen, setPrioritizeModalOpen] = useState(false);
  const [prioritizeResults, setPrioritizeResults] = useState<
    RePrioritizeItem[]
  >([]);
  const [loadingPrioritize, setLoadingPrioritize] = useState(false);

  // Active Dropdowns state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Real-time listener for tasks
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    let unsubscribe = () => {};

    try {
      // Query tasks for current user. We filter soft-deleted and order on client-side to prevent complex Firestore index requirements
      const q = query(
        collection(db, "tasks"),
        where("userId", "==", currentUser.uid),
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const tasksData: Task[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.deleted !== true) {
              tasksData.push({
                id: doc.id,
                ...data,
              } as Task);
            }
          });
          setTasks(tasksData);
          localStorage.setItem(
            `local_tasks_${currentUser.uid}`,
            JSON.stringify(tasksData),
          );
          setLoading(false);
        },
        (error) => {
          console.warn(
            "Firestore listener failed, using local storage fallback:",
            error,
          );
          const cached = localStorage.getItem(`local_tasks_${currentUser.uid}`);
          if (cached) {
            setTasks(JSON.parse(cached));
          }
          setLoading(false);
        },
      );
    } catch (err) {
      console.error("Error establishing task listener:", err);
      const cached = localStorage.getItem(`local_tasks_${currentUser.uid}`);
      if (cached) {
        setTasks(JSON.parse(cached));
      }
      setLoading(false);
    }

    return () => unsubscribe();
  }, [currentUser]);

  // Helper for adding/updating task helper
  const saveTask = async (task: Task | (Partial<Task> & { id: string })) => {
    if (!currentUser) return;

    // Always update local state immediately for fast feedback
    const updatedTasks = tasks.map((t) =>
      t.id === task.id ? ({ ...t, ...task } as Task) : t,
    );
    setTasks(updatedTasks);
    localStorage.setItem(
      `local_tasks_${currentUser.uid}`,
      JSON.stringify(updatedTasks),
    );

    try {
      if (!task.id.startsWith("task_local_")) {
        const { id, ...rest } = task;
        await updateDoc(doc(db, "tasks", id), {
          ...rest,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn(
        "Could not sync task update with firestore, cached locally:",
        err,
      );
    }
  };

  const handleSimpleAdd = async () => {
    if (!taskInput.trim() || !currentUser) return;

    const tempId = "task_local_" + Math.random().toString(36).substring(2, 11);
    const newTask: Task = {
      id: tempId,
      userId: currentUser.uid,
      title: taskInput,
      dueDate: format(addDays(new Date(), 1), "yyyy-MM-dd"), // Default to tomorrow
      priority: "medium",
      category: "personal",
      status: "todo",
      subtasks: [],
      deleted: false,
      createdAt: new Date().toISOString(),
    };

    // Update locally
    const nextTasks = [newTask, ...tasks];
    setTasks(nextTasks);
    localStorage.setItem(
      `local_tasks_${currentUser.uid}`,
      JSON.stringify(nextTasks),
    );
    setTaskInput("");
    toast.success("Task added!");

    try {
      const docRef = await addDoc(collection(db, "tasks"), {
        userId: currentUser.uid,
        title: newTask.title,
        dueDate: newTask.dueDate,
        priority: newTask.priority,
        category: newTask.category,
        status: newTask.status,
        subtasks: newTask.subtasks,
        deleted: false,
        createdAt: serverTimestamp(),
      });
      // Replace local ID with real Firestore ID
      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? { ...t, id: docRef.id } : t)),
      );
    } catch (err) {
      console.warn(
        "Failed to save to Firestore, operating in offline fallback:",
        err,
      );
    }
  };

  const handleAIPlanIt = async () => {
    if (!taskInput.trim() || !currentUser) {
      toast.error("Please describe what you need to accomplish first!");
      return;
    }

    setIsAIPlanning(true);
    const todayStr = format(new Date(), "yyyy-MM-dd (EEEE)");
    const prompt = `The user needs to: '${taskInput}'. Today is ${todayStr}. Break this into 3-5 action-oriented subtasks with time estimates. Return a JSON object strictly matching this schema:
    {
      "title": "A refined version of the main task title if needed, otherwise exact",
      "suggestedDueDate": "YYYY-MM-DD",
      "priority": "critical" or "high" or "medium" or "low",
      "category": "study" or "work" or "personal" or "finance" or "health",
      "estimatedMinutes": total estimated minutes as a number,
      "subtasks": [
        { "title": "Subtask action steps description", "estimatedMinutes": subtask minutes as a number }
      ]
    }`;

    try {
      const result = await askGeminiJSON(
        prompt,
        "You are FlowMind, an elite AI productivity advisor. Always return valid, parsed JSON matching the requested structure perfectly.",
      );
      if (result) {
        const tempId =
          "task_local_" + Math.random().toString(36).substring(2, 11);
        const newAITask: Task = {
          id: tempId,
          userId: currentUser.uid,
          title: result.title || taskInput,
          dueDate: result.suggestedDueDate || format(new Date(), "yyyy-MM-dd"),
          priority: (result.priority || "medium").toLowerCase() as Priority,
          category: (result.category || "personal").toLowerCase() as Category,
          estimatedMinutes: result.estimatedMinutes || 30,
          subtasks: (result.subtasks || []).map((s: any) => ({
            title: s.title,
            estimatedMinutes: s.estimatedMinutes || 15,
            done: false,
          })),
          status: "todo",
          isAIGenerated: true,
          deleted: false,
          createdAt: new Date().toISOString(),
        };

        const nextTasks = [newAITask, ...tasks];
        setTasks(nextTasks);
        localStorage.setItem(
          `local_tasks_${currentUser.uid}`,
          JSON.stringify(nextTasks),
        );
        setTaskInput("");
        toast.success("✨ AI created your action plan!");

        try {
          const docRef = await addDoc(collection(db, "tasks"), {
            userId: currentUser.uid,
            title: newAITask.title,
            dueDate: newAITask.dueDate,
            priority: newAITask.priority,
            category: newAITask.category,
            estimatedMinutes: newAITask.estimatedMinutes,
            subtasks: newAITask.subtasks,
            status: newAITask.status,
            isAIGenerated: true,
            deleted: false,
            createdAt: serverTimestamp(),
          });
          setTasks((prev) =>
            prev.map((t) => (t.id === tempId ? { ...t, id: docRef.id } : t)),
          );
        } catch (fsErr) {
          console.warn(
            "Could not save AI planned task online, keeping in local cache:",
            fsErr,
          );
        }
      } else {
        throw new Error("AI returned empty result");
      }
    } catch (err) {
      console.error("AI Planning failed:", err);
      toast.error("AI temporarily unavailable — added task manually instead!");
      // Default fallback
      handleSimpleAdd();
    } finally {
      setIsAIPlanning(false);
    }
  };

  const toggleTaskStatus = (task: Task) => {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    saveTask({ ...task, status: nextStatus });
    if (nextStatus === "done") {
      toast.success("Task completed! Keep it up! 🎉");
    }
  };

  const handleSoftDelete = (taskId: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, deleted: true } : t,
    );
    setTasks(updated);
    localStorage.setItem(
      `local_tasks_${currentUser!.uid}`,
      JSON.stringify(updated),
    );

    if (!taskId.startsWith("task_local_")) {
      updateDoc(doc(db, "tasks", taskId), { deleted: true })
        .then(() => toast.success("Task deleted"))
        .catch((err) => console.error("Firestore delete error:", err));
    } else {
      toast.success("Task deleted");
    }
  };

  const handleDuplicate = async (task: Task) => {
    const tempId = "task_local_" + Math.random().toString(36).substring(2, 11);
    const duplicatedTask: Task = {
      ...task,
      id: tempId,
      title: `${task.title} (Copy)`,
      createdAt: new Date().toISOString(),
    };

    const nextTasks = [duplicatedTask, ...tasks];
    setTasks(nextTasks);
    localStorage.setItem(
      `local_tasks_${currentUser!.uid}`,
      JSON.stringify(nextTasks),
    );
    toast.success("Task duplicated");

    try {
      const docRef = await addDoc(collection(db, "tasks"), {
        userId: currentUser!.uid,
        title: duplicatedTask.title,
        dueDate: duplicatedTask.dueDate,
        priority: duplicatedTask.priority,
        category: duplicatedTask.category,
        estimatedMinutes: duplicatedTask.estimatedMinutes || 0,
        subtasks: duplicatedTask.subtasks || [],
        status: duplicatedTask.status,
        isAIGenerated: duplicatedTask.isAIGenerated || false,
        deleted: false,
        createdAt: serverTimestamp(),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? { ...t, id: docRef.id } : t)),
      );
    } catch (fsErr) {
      console.warn("Could not duplicate task in Firestore:", fsErr);
    }
  };

  const handleReschedule = (task: Task, days: number) => {
    let baseDate = new Date();
    const existingDate = parseDueDate(task.dueDate);
    if (existingDate && !isPast(existingDate)) {
      baseDate = existingDate;
    }
    const newDueDate = format(addDays(baseDate, days), "yyyy-MM-dd");
    saveTask({ ...task, dueDate: newDueDate });
    toast.success(`Rescheduled to ${newDueDate}`);
  };

  // SMART PRIORITIZATION
  const handleSmartPrioritize = async () => {
    if (tasks.length === 0) {
      toast.error("You don't have any tasks to prioritize!");
      return;
    }
    setLoadingPrioritize(true);
    setPrioritizeModalOpen(true);

    const taskSummary = tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        category: t.category,
        subtasksCount: t.subtasks?.length || 0,
      }));

    const todayStr = format(new Date(), "yyyy-MM-dd (EEEE)");
    const prompt = `Prioritize these tasks for maximum productivity: ${JSON.stringify(taskSummary)}. Today is ${todayStr}. Return a JSON array of task objects sorted from highest priority to lowest. Each object MUST contain:
    - "id": string (the exact task ID)
    - "newPriority": "critical" | "high" | "medium" | "low"
    - "reason": "A precise, motivating explanation in 10-15 words of why this task should be at this priority today."`;

    try {
      const result = await askGeminiJSON(
        prompt,
        "You are Flow, an expert cognitive behavioral therapist and productivity coach. Organize tasks rationally to maximize user energy and minimize anxiety.",
      );
      if (Array.isArray(result)) {
        setPrioritizeResults(result);
      } else if (result && Array.isArray(result.prioritizedTasks)) {
        setPrioritizeResults(result.prioritizedTasks);
      } else {
        throw new Error("Invalid output format");
      }
    } catch (err) {
      console.error("Prioritization failed:", err);
      toast.error("AI Prioritization failed to generate suggestions.");
      setPrioritizeModalOpen(false);
    } finally {
      setLoadingPrioritize(false);
    }
  };

  const applyPrioritization = () => {
    prioritizeResults.forEach((item) => {
      const originalTask = tasks.find((t) => t.id === item.id);
      if (originalTask && originalTask.priority !== item.newPriority) {
        saveTask({ id: item.id, priority: item.newPriority });
      }
    });
    toast.success("⚡ AI priority structure applied!");
    setPrioritizeModalOpen(false);
  };

  // DETAIL MODAL WORK
  const openDetailModal = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
    setAiQuestion("");
    setAiAnswer("");
  };

  const handleAddSubtaskInline = () => {
    if (!newSubtaskTitle.trim() || !selectedTask) return;
    const nextSubtasks = [
      ...(selectedTask.subtasks || []),
      { title: newSubtaskTitle, done: false },
    ];
    const updated = { ...selectedTask, subtasks: nextSubtasks };
    setSelectedTask(updated);
    saveTask(updated);
    setNewSubtaskTitle("");
    toast.success("Subtask added");
  };

  const toggleSubtaskInline = (index: number) => {
    if (!selectedTask) return;
    const nextSubtasks = (selectedTask.subtasks || []).map((s, i) =>
      i === index ? { ...s, done: !s.done } : s,
    );
    const updated = { ...selectedTask, subtasks: nextSubtasks };
    setSelectedTask(updated);
    saveTask(updated);
  };

  const removeSubtaskInline = (index: number) => {
    if (!selectedTask) return;
    const nextSubtasks = (selectedTask.subtasks || []).filter(
      (_, i) => i !== index,
    );
    const updated = { ...selectedTask, subtasks: nextSubtasks };
    setSelectedTask(updated);
    saveTask(updated);
  };

  const handleAskFlowAboutTask = async () => {
    if (!aiQuestion.trim() || !selectedTask) return;
    setLoadingAiAnswer(true);
    setAiAnswer("");

    const prompt = `The user is working on the task: '${selectedTask.title}'. Description: '${selectedTask.description || "None"}'.
    Their question: '${aiQuestion}'.
    Give a specific, direct, actionable productivity coaching response in under 60 words. Avoid generic fluff.`;

    try {
      const response = await askGemini(
        prompt,
        "You are Flow, an expert productivity strategist. Be concise, brilliant, and deeply helpful.",
      );
      setAiAnswer(response);
    } catch (err) {
      console.error("AI chat error:", err);
      setAiAnswer(
        "Sorry, I'm currently unable to retrieve tips for this task. Try again shortly!",
      );
    } finally {
      setLoadingAiAnswer(false);
    }
  };

  // FILTER & SORT IMPLEMENTATION
  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        // Search filter
        if (
          searchQuery.trim() &&
          !task.title.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        // Category filter
        if (filterCategory !== "all" && task.category !== filterCategory) {
          return false;
        }
        // Priority filter
        if (filterPriority !== "all" && task.priority !== filterPriority) {
          return false;
        }
        // Time filter
        if (filterTime !== "all") {
          const date = parseDueDate(task.dueDate);
          if (!date) return false;
          if (filterTime === "today" && !isToday(date)) return false;
          if (
            filterTime === "overdue" &&
            (!isPast(date) || isToday(date) || task.status === "done")
          )
            return false;
          if (filterTime === "week" && !isThisWeek(date)) return false;
        }
        return true;
      }),
    [tasks, searchQuery, filterCategory, filterPriority, filterTime],
  );

  // Sort tasks
  const sortedTasks = useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        if (sortBy === "dueDate") {
          const da = parseDueDate(a.dueDate);
          const dbDate = parseDueDate(b.dueDate);
          if (!da) return 1;
          if (!dbDate) return -1;
          return da.getTime() - dbDate.getTime();
        }
        if (sortBy === "priority") {
          const pMap: Record<Priority, number> = {
            critical: 4,
            high: 3,
            medium: 2,
            low: 1,
          };
          return (pMap[b.priority] || 2) - (pMap[a.priority] || 2);
        }
        if (sortBy === "alphabetical") {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === "createdAt") {
          const ca = a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : new Date(a.createdAt).getTime();
          const cb = b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : new Date(b.createdAt).getTime();
          return cb - ca;
        }
        return 0;
      }),
    [filteredTasks, sortBy],
  );

  // Split into active and done
  const activeTasks = useMemo(
    () => sortedTasks.filter((t) => t.status !== "done"),
    [sortedTasks],
  );
  const doneTasks = useMemo(
    () => sortedTasks.filter((t) => t.status === "done"),
    [sortedTasks],
  );
  const displayTasks = useMemo(
    () => [...activeTasks, ...doneTasks],
    [activeTasks, doneTasks],
  );

  // Helper for grouping tasks (list view)
  const groupTasks = (tasksList: Task[]) => {
    const groups: { [key: string]: Task[] } = {
      Overdue: [],
      Today: [],
      Tomorrow: [],
      "This Week": [],
      Later: [],
      "No Due Date": [],
    };

    tasksList.forEach((task) => {
      const date = parseDueDate(task.dueDate);
      if (!date) {
        groups["No Due Date"].push(task);
      } else if (task.status !== "done" && isPast(date) && !isToday(date)) {
        groups["Overdue"].push(task);
      } else if (isToday(date)) {
        groups["Today"].push(task);
      } else if (isTomorrow(date)) {
        groups["Tomorrow"].push(task);
      } else if (isThisWeek(date)) {
        groups["This Week"].push(task);
      } else {
        groups["Later"].push(task);
      }
    });

    return groups;
  };

  const groupedTasks = groupTasks(displayTasks);

  // DRAG AND DROP KANBAN
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const id = draggedTaskId || e.dataTransfer.getData("text/plain");
    if (id) {
      const task = tasks.find((t) => t.id === id);
      if (task && task.status !== targetStatus) {
        saveTask({ id, status: targetStatus });
        toast.success(
          `Moved to ${targetStatus === "todo" ? "To Do" : targetStatus === "in-progress" ? "In Progress" : "Done"}`,
        );
      }
    }
    setDraggedTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // TIMELINE VIEW PREPARATION
  // Render dates starting from 2 days ago to 5 days from now (8 total days)
  const timelineDates = Array.from({ length: 8 }).map((_, i) =>
    addDays(addDays(new Date(), -2), i),
  );

  // RENDER COMPONENT METHODS
  const getPriorityBadgeStyles = (priority: Priority) => {
    switch (priority) {
      case "critical":
        return "bg-danger/15 text-danger border border-danger/30";
      case "high":
        return "bg-orange-500/15 text-orange-500 border border-orange-500/30";
      case "medium":
        return "bg-accent/15 text-accent border border-accent/30";
      case "low":
        return "bg-muted/10 text-muted border border-surface";
      default:
        return "bg-muted/10 text-muted border border-surface";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-surface pb-6">
        <div>
          <h1 className="text-3xl font-bold font-display text-text flex items-center gap-2">
            <CheckSquare className="w-8 h-8 text-primary" />
            Productivity Board
          </h1>
          <p className="text-muted text-sm mt-1">
            FlowMind Task Engine: Organise your agenda, structure subtasks, and
            refine priorities with Flow.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-card border border-surface p-1 rounded-xl">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "list"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-text"
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "board"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-text"
              }`}
            >
              <Layers className="w-4 h-4" />
              Board
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "timeline"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-text"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Timeline
            </button>
          </div>

          <button
            onClick={handleSmartPrioritize}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(235,94,40,0.1)] transition-all cursor-pointer ml-auto md:ml-0"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Smart Prioritise</span>
            <span className="sm:hidden">Prioritise</span>
          </button>
        </div>
      </div>

      {/* AI INPUT BAR */}
      <div className="premium-card p-4 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none group-hover:bg-primary/20 transition-all duration-700"></div>
        <div className="relative flex flex-col md:flex-row gap-3 items-stretch z-10">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.5} />
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSimpleAdd()}
              placeholder="Describe what you need to accomplish... (e.g. 'Prepare for data structures exam on Friday')"
              className="w-full pl-12 pr-4 py-4 bg-background border border-surface rounded-xl focus:outline-none focus:border-primary/50 text-text placeholder-muted text-[13px] font-medium transition-all shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]"
            />
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleSimpleAdd}
              disabled={isAIPlanning || !taskInput.trim()}
              className="flex-1 md:flex-initial px-5 py-4 bg-surface hover:bg-surface-hover text-text border border-surface hover:border-muted/40 rounded-xl font-semibold text-[13px] transition-all focus:outline-none disabled:opacity-50"
            >
              Add Task
            </button>
            <button
              onClick={handleAIPlanIt}
              disabled={isAIPlanning || !taskInput.trim()}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-[13px] shadow-[0_4px_12px_rgba(124,110,240,0.3)] hover:shadow-[0_8px_24px_rgba(124,110,240,0.4)] hover:-translate-y-0.5 transition-all duration-200 focus:outline-none disabled:opacity-50 cursor-pointer"
            >
              {isAIPlanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Planning...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Plan It
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* FILTER & SORT BAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 premium-card p-4">
        <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
          {/* Search bar helper */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-surface rounded-lg text-xs font-medium text-text focus:outline-none focus:border-primary/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
            />
          </div>

          {/* Time filters */}
          <div className="flex bg-background border border-surface rounded-lg p-1 shadow-sm">
            {["all", "today", "overdue", "week"].map((time) => (
              <button
                key={time}
                onClick={() => setFilterTime(time)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all duration-200 ${
                  filterTime === time
                    ? "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text"
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto justify-end">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted font-bold">Category:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-background border border-surface text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:outline-none text-text focus:border-primary/50"
            >
              <option value="all">All</option>
              <option value="work">Work</option>
              <option value="study">Study</option>
              <option value="personal">Personal</option>
              <option value="finance">Finance</option>
              <option value="health">Health</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted font-bold">Priority:</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-background border border-surface text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:outline-none text-text focus:border-primary/50"
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Sort selection */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted font-bold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-background border border-surface text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:outline-none text-text focus:border-primary/50"
            >
              <option value="dueDate">Due Date</option>
              <option value="priority">Priority</option>
              <option value="createdAt">Created</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* WORKSPACE AREA */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" strokeWidth={1.5} />
          <p className="text-muted text-sm font-medium">
            Synchronizing task data...
          </p>
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="premium-card p-16 text-center">
          <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5 text-primary shadow-inner">
            <CheckSquare className="w-8 h-8" strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-bold font-display text-text mb-2">No Tasks Found</h3>
          <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
            No matching tasks registered. Input a description above or use the
            "✨ AI Plan It" engine to frame a schedule instantly!
          </p>
        </div>
      ) : (
        <div>
          {/* LIST VIEW */}
          {viewMode === "list" && (
            <div className="space-y-6">
              {displayTasks.length === 0 ? (
                <EmptyState
                  icon={
                    <CheckSquare className="w-12 h-12 text-primary/50 mx-auto" />
                  }
                  title="Nothing here yet"
                  description="You have no tasks matching this criteria. Start by adding a new task!"
                />
              ) : (
                Object.entries(groupedTasks).map(
                  ([groupName, groupTasksList]) => {
                    if (groupTasksList.length === 0) return null;
                    const isOverdue = groupName === "Overdue";
                    return (
                      <div key={groupName} className="space-y-3">
                        <h2
                          className={`section-eyebrow flex items-center gap-2 ${
                            isOverdue ? "text-danger" : "text-muted"
                          }`}
                        >
                          {isOverdue && (
                            <AlertTriangle className="w-4 h-4 animate-bounce" strokeWidth={2} />
                          )}
                          {groupName} ({groupTasksList.length})
                        </h2>

                        <div className="grid grid-cols-1 lg:grid-cols-1 gap-3">
                          {groupTasksList.map((task) => {
                            const date = parseDueDate(task.dueDate);
                            const subtasksCount = task.subtasks?.length || 0;
                            const subtasksDone =
                              task.subtasks?.filter((s) => s.done).length || 0;
                            const hasSubtasks = subtasksCount > 0;
                            const pct = hasSubtasks
                              ? Math.round((subtasksDone / subtasksCount) * 100)
                              : 0;
                            const isDone = task.status === "done";

                            return (
                              <motion.div
                                layout
                                key={task.id}
                                className={`premium-card premium-card-hover p-4 flex flex-col lg:flex-row lg:items-center gap-4 relative group ${
                                  isDone ? "opacity-50 hover:opacity-100" : ""
                                }`}
                              >
                                {/* Checkbox */}
                                <button
                                  onClick={() => toggleTaskStatus(task)}
                                  className="shrink-0 focus:outline-none text-muted hover:text-primary transition-colors"
                                >
                                  {isDone ? (
                                    <CheckCircle className="w-6 h-6 text-success fill-success/10" strokeWidth={1.5} />
                                  ) : (
                                    <Circle className="w-6 h-6 hover:scale-105 transition-transform" strokeWidth={1.5} />
                                  )}
                                </button>

                                {/* Core Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span
                                      className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${getPriorityBadgeStyles(task.priority)}`}
                                    >
                                      <div className="w-1 h-1 rounded-full bg-current"></div>
                                      {task.priority}
                                    </span>
                                    <span className="text-[10px] font-bold tracking-widest uppercase bg-surface text-muted px-2 py-0.5 rounded-full border border-surface">
                                      {task.category}
                                    </span>
                                    {task.isAIGenerated && (
                                      <span className="text-[10px] font-bold tracking-widest uppercase bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" strokeWidth={2} />
                                        AI
                                      </span>
                                    )}
                                  </div>

                                  <h3
                                    onClick={() => openDetailModal(task)}
                                    className={`font-bold text-text text-base truncate hover:text-primary cursor-pointer transition-colors ${
                                      isDone ? "line-through text-muted font-semibold" : ""
                                    }`}
                                  >
                                    {task.title}
                                  </h3>

                                  {/* Progress bar if subtasks */}
                                  {hasSubtasks && (
                                    <div className="mt-3 max-w-xs flex items-center gap-3">
                                      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                                          style={{ width: `${pct}%` }}
                                        ></div>
                                      </div>
                                      <span className="text-[10px] font-mono font-semibold tracking-wide text-muted">
                                        {subtasksDone}/{subtasksCount}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Meta Right Column */}
                                <div className="flex items-center justify-between lg:justify-end gap-5 shrink-0 border-t lg:border-t-0 border-surface pt-3 lg:pt-0">
                                  {date && (
                                    <div
                                      className={`flex items-center gap-2 text-[13px] font-semibold ${
                                        isPast(date) &&
                                        !isToday(date) &&
                                        !isDone
                                          ? "text-danger"
                                          : "text-muted"
                                      }`}
                                    >
                                      <Calendar className="w-4 h-4" strokeWidth={2} />
                                      <span>{format(date, "MMM dd")}</span>
                                      {!isDone && (
                                        <span className="text-[11px] font-medium opacity-85 uppercase tracking-wider">
                                          (
                                          {formatDistanceToNow(date, {
                                            addSuffix: true,
                                          })}
                                          )
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* 3-Dot Actions */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdown(
                                          activeDropdown === task.id
                                            ? null
                                            : task.id,
                                        );
                                      }}
                                      className="p-2 hover:bg-surface rounded-lg transition-colors text-muted hover:text-text focus:outline-none"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>

                                    <AnimatePresence>
                                      {activeDropdown === task.id && (
                                        <motion.div
                                          initial={{ opacity: 0, y: 5 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: 5 }}
                                          className="absolute right-0 mt-2 w-48 premium-card py-1.5 z-30 overflow-hidden shadow-2xl"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={() => {
                                              openDetailModal(task);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface flex items-center gap-2.5 transition-colors"
                                          >
                                            <Edit3 className="w-4 h-4 text-muted" strokeWidth={2} />
                                            Edit Details
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleDuplicate(task);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface flex items-center gap-2.5 transition-colors"
                                          >
                                            <Copy className="w-4 h-4 text-muted" strokeWidth={2} />
                                            Duplicate Task
                                          </button>
                                          <div className="border-t border-surface my-1.5"></div>
                                          <div className="px-4 py-1 text-[10px] font-bold text-muted uppercase tracking-wider">
                                            Reschedule
                                          </div>
                                          <button
                                            onClick={() => {
                                              handleReschedule(task, 0);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-4 py-1.5 text-[13px] font-semibold text-text hover:bg-surface transition-colors pl-7"
                                          >
                                            Today
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleReschedule(task, 1);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-3.5 py-1.5 text-xs font-medium text-text hover:bg-surface transition-colors pl-6"
                                          >
                                            Tomorrow
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleReschedule(task, 3);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-3.5 py-1.5 text-xs font-medium text-text hover:bg-surface transition-colors pl-6"
                                          >
                                            +3 Days
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleReschedule(task, 7);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-3.5 py-1.5 text-xs font-medium text-text hover:bg-surface transition-colors pl-6"
                                          >
                                            +1 Week
                                          </button>
                                          <div className="border-t border-surface my-1"></div>
                                          <button
                                            onClick={() => {
                                              handleSoftDelete(task.id);
                                              setActiveDropdown(null);
                                            }}
                                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-danger hover:bg-danger/10 flex items-center gap-2 transition-colors"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Delete
                                          </button>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  },
                )
              )}
            </div>
          )}

          {/* BOARD VIEW (Kanban) */}
          {viewMode === "board" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {(["todo", "in-progress", "done"] as TaskStatus[]).map(
                (status) => {
                  const statusTasks = displayTasks.filter((t) => {
                    if (status === "todo")
                      return t.status === "todo" || !t.status;
                    return t.status === status;
                  });

                  const colTitle =
                    status === "todo"
                      ? "To Do"
                      : status === "in-progress"
                        ? "In Progress"
                        : "Done";
                  const colHeaderColor =
                    status === "todo"
                      ? "bg-primary/20 text-primary border-primary/30"
                      : status === "in-progress"
                        ? "bg-accent/20 text-accent border-accent/30"
                        : "bg-success/20 text-success border-success/30";
                  
                  const colBg = 
                     status === "todo"
                      ? "bg-primary/[0.02] border-primary/10"
                      : status === "in-progress"
                        ? "bg-accent/[0.02] border-accent/10"
                        : "bg-success/[0.02] border-success/10";

                  return (
                    <div
                      key={status}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, status)}
                      className={`border rounded-3xl p-4 flex flex-col gap-4 min-h-[500px] shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] ${colBg}`}
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest border ${colHeaderColor}`}
                          >
                            {colTitle}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold font-mono text-muted bg-background px-3 py-1 rounded-full border border-surface shadow-inner">
                          {statusTasks.length}
                        </span>
                      </div>

                      {/* Column body */}
                      <div className="flex flex-col gap-3 flex-1">
                        {statusTasks.length === 0 ? (
                          <div className="border border-dashed border-white/10 rounded-2xl p-8 text-center text-xs text-muted flex-1 flex flex-col items-center justify-center bg-black/10">
                            <Layers className="w-6 h-6 text-muted/30 mb-2" strokeWidth={1.5} />
                            Drag tasks here
                          </div>
                        ) : (
                          statusTasks.map((task) => {
                            const date = parseDueDate(task.dueDate);
                            const isDone = task.status === "done";
                            const subtasksCount = task.subtasks?.length || 0;
                            const subtasksDone =
                              task.subtasks?.filter((s) => s.done).length || 0;
                            const hasSubtasks = subtasksCount > 0;
                            const pct = hasSubtasks
                              ? Math.round((subtasksDone / subtasksCount) * 100)
                              : 0;

                            return (
                              <div
                                key={task.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, task.id)}
                                className={`premium-card p-4 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                                  isDone ? "opacity-55 hover:opacity-100" : ""
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2 mb-3">
                                  <span
                                    className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm flex items-center gap-1 ${getPriorityBadgeStyles(task.priority)}`}
                                  >
                                    <div className="w-1 h-1 rounded-full bg-current"></div>
                                    {task.priority}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase tracking-widest bg-surface text-muted px-2 py-0.5 rounded-sm border border-surface">
                                    {task.category}
                                  </span>
                                </div>

                                <h4
                                  onClick={() => openDetailModal(task)}
                                  className={`font-semibold text-text text-[13px] hover:text-primary transition-colors cursor-pointer leading-snug ${
                                    isDone ? "line-through text-muted" : ""
                                  }`}
                                >
                                  {task.title}
                                </h4>

                                {hasSubtasks && (
                                  <div className="mt-3.5 flex items-center gap-2.5">
                                    <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${pct}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold tracking-wide text-muted">
                                      {subtasksDone}/{subtasksCount}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between border-t border-surface mt-4 pt-3 text-[11px] font-semibold text-muted">
                                  <span className="flex items-center gap-1.5 uppercase tracking-wider">
                                    <Calendar className="w-3.5 h-3.5" strokeWidth={2} />
                                    {date ? format(date, "MMM dd") : "No date"}
                                  </span>

                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => openDetailModal(task)}
                                      className="p-1 hover:bg-surface rounded-md text-muted hover:text-text transition-colors"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" strokeWidth={2} />
                                    </button>
                                    <button
                                      onClick={() => handleSoftDelete(task.id)}
                                      className="p-1 hover:bg-danger/10 rounded-md text-muted hover:text-danger transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}

          {/* TIMELINE VIEW */}
          {viewMode === "timeline" && (
            <div className="bg-card border border-surface rounded-2xl p-6 shadow-sm overflow-x-auto">
              <div className="min-w-[800px] relative">
                {/* Timeline Header Row (Dates) */}
                <div className="grid grid-cols-[200px_repeat(8,1fr)] border-b border-surface pb-4">
                  <div className="text-xs font-bold text-muted uppercase tracking-wider">
                    Task Item
                  </div>
                  {timelineDates.map((date, i) => {
                    const isTodayDate = isToday(date);
                    return (
                      <div
                        key={i}
                        className={`text-center flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg ${
                          isTodayDate
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-muted"
                        }`}
                      >
                        <span className="text-xxs font-bold uppercase tracking-wide">
                          {format(date, "EEE")}
                        </span>
                        <span className="text-xs font-bold font-mono">
                          {format(date, "dd")}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* TODAY vertical alignment guide overlay helper */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{
                    left: "calc(200px + (100% - 200px) / 8 * 2 + (100% - 200px) / 16)",
                  }}
                >
                  <div className="w-[1px] h-full bg-danger border-dashed border-l border-danger opacity-60 z-10"></div>
                </div>

                {/* Timeline Tasks rows */}
                <div className="divide-y divide-surface mt-4">
                  {displayTasks
                    .filter((t) => parseDueDate(t.dueDate))
                    .map((task) => {
                      const dueDate = parseDueDate(task.dueDate)!;
                      const daysDiff = differenceInDays(
                        dueDate,
                        timelineDates[0],
                      );
                      const isDone = task.status === "done";

                      // Determine grid positioning index
                      let colStartIdx = -1;
                      timelineDates.forEach((td, idx) => {
                        if (
                          format(td, "yyyy-MM-dd") ===
                          format(dueDate, "yyyy-MM-dd")
                        ) {
                          colStartIdx = idx;
                        }
                      });

                      // Priority based style
                      let barColor = "bg-accent/20 border-accent text-accent";
                      if (task.priority === "critical")
                        barColor = "bg-danger/20 border-danger text-danger";
                      else if (task.priority === "high")
                        barColor =
                          "bg-orange-500/20 border-orange-500 text-orange-500";
                      else if (task.priority === "low")
                        barColor = "bg-muted/10 border-surface text-muted";

                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[200px_repeat(8,1fr)] py-3 items-center group"
                        >
                          <div
                            onClick={() => openDetailModal(task)}
                            className="text-xs font-semibold text-text truncate pr-4 cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                task.priority === "critical"
                                  ? "bg-danger"
                                  : task.priority === "high"
                                    ? "bg-orange-500"
                                    : task.priority === "medium"
                                      ? "bg-accent"
                                      : "bg-muted"
                              }`}
                            ></span>
                            <span
                              className={
                                isDone ? "line-through text-muted" : ""
                              }
                            >
                              {task.title}
                            </span>
                          </div>

                          {/* Rendering blocks in grid */}
                          {Array.from({ length: 8 }).map((_, colIdx) => {
                            const isTaskOnCol = colIdx === colStartIdx;
                            return (
                              <div
                                key={colIdx}
                                className="h-8 flex items-center justify-center px-1 relative"
                              >
                                {isTaskOnCol && (
                                  <motion.div
                                    layoutId={`timeline-bar-${task.id}`}
                                    onClick={() => openDetailModal(task)}
                                    className={`absolute inset-x-1 py-1 px-2 rounded-lg border text-[10px] font-bold text-center truncate cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${barColor} ${
                                      isDone ? "opacity-40" : ""
                                    }`}
                                  >
                                    {task.category}
                                  </motion.div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SMART PRIORITIZATION RESULTS MODAL */}
      <AnimatePresence>
        {prioritizeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-card border border-surface w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-surface flex justify-between items-center bg-surface/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-accent w-6 h-6 animate-pulse" />
                  <h2 className="text-lg font-bold text-text">
                    ✨ AI Smart Prioritisation Model
                  </h2>
                </div>
                <button
                  onClick={() => setPrioritizeModalOpen(false)}
                  className="p-1 hover:bg-surface rounded-lg text-muted hover:text-text transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                {loadingPrioritize ? (
                  <div className="py-16 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <h3 className="font-bold text-text mb-1">
                      Analysing Task Urgency & Priority
                    </h3>
                    <p className="text-xs text-muted max-w-sm">
                      Flow is correlating due dates, task complexity, subtasks
                      count, and categories to construct a pristine schedule
                      map...
                    </p>
                  </div>
                ) : prioritizeResults.length === 0 ? (
                  <div className="text-center py-12 text-muted text-sm">
                    Unable to generate smart prioritizing right now. Make sure
                    you have at least 1-2 active tasks!
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-primary leading-relaxed flex gap-2.5 items-start">
                      <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <strong>Optimal Energy-Allocation Layout:</strong> Below
                        is your AI-restructured task list. Flow has balanced
                        high-cognitive actions with straightforward maintenance,
                        keeping you focused without burnout.
                      </div>
                    </div>

                    <div className="space-y-3">
                      {prioritizeResults.map((item, idx) => {
                        const original = tasks.find((t) => t.id === item.id);
                        if (!original) return null;

                        return (
                          <div
                            key={item.id}
                            className="bg-background border border-surface rounded-xl p-4 flex gap-4"
                          >
                            <span className="text-xs font-bold font-mono text-muted bg-surface w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-surface mt-1">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-text text-sm truncate">
                                {original.title}
                              </h4>
                              <p className="text-xs text-muted italic mt-1 font-medium bg-surface/30 px-2.5 py-1.5 rounded-lg border border-surface/50">
                                "{item.reason}"
                              </p>

                              <div className="flex items-center gap-3 mt-3">
                                <span className="text-xxs text-muted font-bold uppercase">
                                  Priority Transition:
                                </span>
                                <div className="flex items-center gap-1.5 text-xs font-bold">
                                  <span className="text-muted capitalize line-through">
                                    {original.priority}
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-muted" />
                                  <span
                                    className={`capitalize px-2 py-0.5 rounded-full text-xxs ${getPriorityBadgeStyles(item.newPriority)}`}
                                  >
                                    {item.newPriority}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {!loadingPrioritize && prioritizeResults.length > 0 && (
                <div className="p-4 border-t border-surface flex justify-end gap-3 bg-surface/10">
                  <button
                    onClick={() => setPrioritizeModalOpen(false)}
                    className="px-4 py-2 bg-surface hover:bg-surface-hover text-text border border-surface rounded-xl text-xs font-semibold transition-all"
                  >
                    Discard Layout
                  </button>
                  <button
                    onClick={applyPrioritization}
                    className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                  >
                    Apply AI Priorities
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TASK DETAIL MODAL */}
      <AnimatePresence>
        {detailModalOpen && selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="premium-card w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-surface/20 relative z-10">
                <div className="flex items-center gap-3 text-muted text-xs uppercase tracking-widest font-bold">
                  <CheckSquare className="w-4 h-4 text-primary" strokeWidth={2} />
                  <span>Task Details Panel</span>
                  {selectedTask.isAIGenerated && (
                    <span className="ml-2 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1 shadow-inner">
                      <Sparkles className="w-3 h-3" />
                      AI Planned
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    id="btn-trigger-focus-mode"
                    onClick={() => {
                      setDetailModalOpen(false);
                      startFocusSession(selectedTask);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent hover:text-accent border border-accent/20 hover:border-accent/40 transition-all text-xs font-bold shadow-inner drop-shadow-[0_0_8px_rgba(240,165,0,0.2)] hover:drop-shadow-[0_0_12px_rgba(240,165,0,0.4)]"
                  >
                    <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                    Start Focus
                  </button>
                  <button
                    onClick={() => setDetailModalOpen(false)}
                    className="p-1.5 bg-surface/50 hover:bg-surface border border-white/5 rounded-lg text-muted hover:text-text transition-all shadow-inner"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-8 flex-1 overflow-y-auto space-y-8 relative z-10 custom-scrollbar">
                {/* Title Editor */}
                <div>
                  <input
                    type="text"
                    value={selectedTask.title}
                    onChange={(e) => {
                      const updated = {
                        ...selectedTask,
                        title: e.target.value,
                      };
                      setSelectedTask(updated);
                      saveTask(updated);
                    }}
                    className="w-full text-3xl font-bold font-display bg-transparent border-b-2 border-transparent hover:border-white/10 focus:border-primary focus:outline-none pb-2 text-text transition-all leading-tight placeholder-muted/50"
                    placeholder="Task Title..."
                  />
                  <p className="text-[10px] uppercase tracking-widest text-muted/60 font-bold mt-2">
                    Click heading above to edit inline.
                  </p>
                </div>

                {/* Configuration Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface/30 p-6 rounded-2xl border border-white/5 shadow-inner">
                  {/* Due Date Picker */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={selectedTask.dueDate || ""}
                      onChange={(e) => {
                        const updated = {
                          ...selectedTask,
                          dueDate: e.target.value,
                        };
                        setSelectedTask(updated);
                        saveTask(updated);
                      }}
                      className="bg-background border border-white/5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-text focus:outline-none focus:border-primary/50 focus:bg-surface w-full transition-all shadow-inner"
                    />
                  </div>

                  {/* Priority Select */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                      Priority
                    </label>
                    <select
                      value={selectedTask.priority}
                      onChange={(e) => {
                        const updated = {
                          ...selectedTask,
                          priority: e.target.value as Priority,
                        };
                        setSelectedTask(updated);
                        saveTask(updated);
                      }}
                      className="bg-background border border-white/5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-text focus:outline-none focus:border-primary/50 focus:bg-surface w-full capitalize transition-all shadow-inner"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  {/* Category Select */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                      Category
                    </label>
                    <select
                      value={selectedTask.category}
                      onChange={(e) => {
                        const updated = {
                          ...selectedTask,
                          category: e.target.value as Category,
                        };
                        setSelectedTask(updated);
                        saveTask(updated);
                      }}
                      className="bg-background border border-white/5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-text focus:outline-none focus:border-primary/50 focus:bg-surface w-full capitalize transition-all shadow-inner"
                    >
                      <option value="work">Work</option>
                      <option value="study">Study</option>
                      <option value="personal">Personal</option>
                      <option value="finance">Finance</option>
                      <option value="health">Health</option>
                    </select>
                  </div>
                </div>

                {/* Notes Textarea */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                    Description & Notes
                  </label>
                  <textarea
                    value={selectedTask.description || ""}
                    onChange={(e) => {
                      const updated = {
                        ...selectedTask,
                        description: e.target.value,
                      };
                      setSelectedTask(updated);
                      saveTask(updated);
                    }}
                    placeholder="Enter any notes, links, or instructions here..."
                    className="w-full bg-surface/30 border border-white/5 rounded-2xl p-5 text-[13px] leading-relaxed text-text focus:outline-none focus:border-primary/50 focus:bg-background min-h-[100px] transition-all shadow-inner resize-y custom-scrollbar"
                  />
                </div>

                {/* Subtask Checklists */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                      Subtasks checklist (
                      {selectedTask.subtasks?.filter((s) => s.done).length || 0}{" "}
                      / {selectedTask.subtasks?.length || 0})
                    </label>
                  </div>

                  {/* Progress bar */}
                  {selectedTask.subtasks &&
                    selectedTask.subtasks.length > 0 && (
                      <div className="h-1.5 bg-background rounded-full overflow-hidden shadow-inner border border-white/5">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.round(
                              ((selectedTask.subtasks.filter((s) => s.done)
                                .length || 0) /
                                (selectedTask.subtasks.length || 1)) *
                                100,
                            )}%`,
                          }}
                        ></div>
                      </div>
                    )}

                  {/* Subtask Items */}
                  <div className="space-y-2">
                    {(selectedTask.subtasks || []).map((sub, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-surface/30 border border-white/5 p-3 rounded-xl group/item hover:border-white/10 transition-colors shadow-inner"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => toggleSubtaskInline(i)}
                            className={`shrink-0 transition-all focus:outline-none ${sub.done ? "text-primary" : "text-muted hover:text-primary/70"}`}
                          >
                            {sub.done ? (
                              <CheckCircle className="w-5 h-5 fill-primary/20 drop-shadow-[0_0_8px_rgba(124,110,240,0.4)]" />
                            ) : (
                              <Circle className="w-5 h-5" strokeWidth={2} />
                            )}
                          </button>
                          <span
                            className={`text-[13px] truncate ${sub.done ? "line-through text-muted" : "text-text"}`}
                          >
                            {sub.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {sub.estimatedMinutes && (
                            <span className="text-[10px] font-mono font-bold bg-background text-muted px-2 py-1 rounded-md border border-white/5 shadow-inner uppercase tracking-wider">
                              ⏳ {sub.estimatedMinutes}m
                            </span>
                          )}
                          <button
                            onClick={() => removeSubtaskInline(i)}
                            className="p-1.5 hover:bg-danger/10 text-muted hover:text-danger rounded-lg transition-colors opacity-0 group-hover/item:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add subtask inline */}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddSubtaskInline()
                      }
                      placeholder="Add subtask action item..."
                      className="flex-1 bg-background border border-white/5 px-4 py-3 rounded-xl text-[13px] focus:outline-none focus:border-primary/50 focus:bg-surface text-text transition-all shadow-inner"
                    />
                    <button
                      onClick={handleAddSubtaskInline}
                      disabled={!newSubtaskTitle.trim()}
                      className="px-5 py-3 bg-surface hover:bg-surface-hover border border-white/5 rounded-xl text-[12px] font-bold text-text disabled:opacity-50 transition-all uppercase tracking-widest shadow-inner cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* ASK FLOW SECTION */}
                <div className="border-t border-white/5 pt-8 space-y-4">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-primary animate-pulse" strokeWidth={2} />
                    <h3 className="text-[11px] font-bold text-primary uppercase tracking-widest">
                      Ask Flow Mind Advisor
                    </h3>
                  </div>

                  <div className="bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 p-6 rounded-2xl space-y-4 shadow-inner">
                    <p className="text-[12px] text-muted leading-relaxed">
                      Flow can analyze your task details to give direct,
                      tailored strategies for study schedules, code blocks, or
                      presentation flowcharts.
                    </p>

                    {aiAnswer && (
                      <div className="bg-background/80 backdrop-blur-md border border-white/10 rounded-xl p-5 text-[13px] text-text leading-relaxed flex gap-4 shadow-xl">
                        <Bot className="w-6 h-6 text-primary shrink-0 mt-0.5" strokeWidth={2} />
                        <div>
                          <strong className="text-primary block font-bold font-display tracking-wide mb-1 uppercase text-[10px]">
                            Flow AI Advisor
                          </strong>
                          {aiAnswer}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <input
                        type="text"
                        value={aiQuestion}
                        onChange={(e) => setAiQuestion(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAskFlowAboutTask()
                        }
                        placeholder="e.g. 'How should I outline this weekly study session?'"
                        className="flex-1 bg-background border border-white/5 px-4 py-3 rounded-xl text-[13px] text-text focus:outline-none focus:border-primary/50 focus:bg-surface placeholder-muted/50 transition-all shadow-inner"
                      />
                      <button
                        onClick={handleAskFlowAboutTask}
                        disabled={loadingAiAnswer || !aiQuestion.trim()}
                        className="px-5 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-[12px] font-bold shadow-[0_4px_12px_rgba(124,110,240,0.3)] hover:shadow-[0_8px_24px_rgba(124,110,240,0.4)] disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center shrink-0 uppercase tracking-widest gap-2"
                      >
                        {loadingAiAnswer ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4" strokeWidth={2} />
                            Ask
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer info */}
              <div className="p-4 bg-surface/20 border-t border-white/5 text-[9px] uppercase tracking-widest text-muted/60 font-bold font-mono flex flex-wrap justify-between items-center px-8 relative z-10">
                <span>
                  Created:{" "}
                  {selectedTask.createdAt?.seconds
                    ? format(
                        new Date(selectedTask.createdAt.seconds * 1000),
                        "yyyy-MM-dd HH:mm",
                      )
                    : selectedTask.createdAt
                      ? format(
                          new Date(selectedTask.createdAt),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "N/A"}
                </span>
                {selectedTask.updatedAt && (
                  <span>
                    Updated:{" "}
                    {selectedTask.updatedAt?.seconds
                      ? format(
                          new Date(selectedTask.updatedAt.seconds * 1000),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "N/A"}
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
