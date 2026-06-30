import { useState, useEffect } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  isToday,
  isPast,
  addDays,
  parseISO,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Calendar as CalendarIcon,
  Plus,
  X,
  Loader2,
  Download,
  Flame,
  CheckCircle2,
  Trash2,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { askGeminiJSON } from "../lib/gemini";
import toast from "react-hot-toast";
import { parseDueDate } from "./Dashboard";

// Set up the localizer for react-big-calendar
const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar);

type Priority = "critical" | "high" | "medium" | "low";
type Category = "study" | "work" | "personal" | "finance" | "health";
type TaskStatus = "todo" | "in-progress" | "done";

interface Subtask {
  title: string;
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

interface FocusSlot {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export default function CalendarPage() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Big Calendar views and navigation state
  const [currentView, setCurrentView] = useState<any>("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Detail Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Quick Add Modal State
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState<Category>("personal");
  const [quickPriority, setQuickPriority] = useState<Priority>("medium");
  const [quickDescription, setQuickDescription] = useState("");

  // Collapsible AI Schedule Builder State
  const [isSchedulePanelOpen, setIsSchedulePanelOpen] = useState(true);
  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [buildingSchedule, setBuildingSchedule] = useState(false);

  // Focus Time Finder State
  const [focusDuration, setFocusDuration] = useState<number>(25);
  const [findingFocus, setFindingFocus] = useState(false);
  const [focusSlots, setFocusSlots] = useState<FocusSlot[]>([]);

  // Real-time listener for tasks
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    let unsubscribe = () => {};

    try {
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
          setLoading(false);
        },
        (error) => {
          console.error("Firestore error loading tasks:", error);
          toast.error("Failed to sync your tasks in real-time.");
          setLoading(false);
        },
      );
    } catch (err) {
      console.error("Snapshot registration failed:", err);
      setLoading(false);
    }

    return () => unsubscribe();
  }, [currentUser]);

  // Map tasks to react-big-calendar event structure
  const events = tasks.map((task) => {
    const parsedDate = parseDueDate(task.dueDate) || new Date();
    return {
      id: task.id,
      title: task.title,
      start: parsedDate,
      end: parsedDate,
      allDay: true,
      resource: task,
    };
  });

  // Custom function to determine if a date is overdue
  const isOverdue = (dueDateValue: any) => {
    const date = parseDueDate(dueDateValue);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  // Custom event styles
  const eventPropGetter = (event: any) => {
    const task = event.resource;
    let className = "event-upcoming";

    if (task) {
      if (task.status === "done") {
        className = "event-done";
      } else {
        const parsedDate = parseDueDate(task.dueDate);
        if (parsedDate) {
          if (isToday(parsedDate)) {
            className = "event-today";
          } else if (isOverdue(task.dueDate)) {
            className = "event-overdue";
          }
        }
      }
    }

    return {
      className,
      style: {},
    };
  };

  // Handle Drag & Drop to new date
  const handleEventDrop = async ({ event, start }: any) => {
    const task = event.resource;
    if (!task) return;

    const newDueDate = format(start, "yyyy-MM-dd");
    const updatedTasks = tasks.map((t) =>
      t.id === task.id ? { ...t, dueDate: newDueDate } : t,
    );
    setTasks(updatedTasks);

    try {
      await updateDoc(doc(db, "tasks", task.id), {
        dueDate: newDueDate,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Rescheduled "${task.title}" to ${newDueDate}`);
    } catch (err) {
      console.error("Failed to update task date:", err);
      toast.error("Failed to save changes. Reverting...");
    }
  };

  // Click Event -> Open Detail Modal
  const handleSelectEvent = (event: any) => {
    if (event.resource) {
      setSelectedTask(event.resource);
      setDetailModalOpen(true);
    }
  };

  // Click empty slot -> Open Quick Add Modal
  const handleSelectSlot = ({ start }: any) => {
    const formattedDate = format(start, "yyyy-MM-dd");
    setQuickAddDate(formattedDate);
    setQuickTitle("");
    setQuickDescription("");
    setQuickCategory("personal");
    setQuickPriority("medium");
    setQuickAddOpen(true);
  };

  // Save changes to selected task in detail modal
  const handleSaveDetailTask = async () => {
    if (!selectedTask || !currentUser) return;

    try {
      await updateDoc(doc(db, "tasks", selectedTask.id), {
        title: selectedTask.title,
        description: selectedTask.description || "",
        dueDate: selectedTask.dueDate,
        priority: selectedTask.priority,
        category: selectedTask.category,
        status: selectedTask.status,
        subtasks: selectedTask.subtasks || [],
        updatedAt: serverTimestamp(),
      });
      toast.success("Task updated successfully!");
      setDetailModalOpen(false);
    } catch (err) {
      console.error("Error saving task changes:", err);
      toast.error("Could not update task.");
    }
  };

  // Delete task from detail modal (soft-delete)
  const handleDeleteDetailTask = async () => {
    if (!selectedTask || !currentUser) return;

    if (confirm(`Are you sure you want to delete "${selectedTask.title}"?`)) {
      try {
        await updateDoc(doc(db, "tasks", selectedTask.id), {
          deleted: true,
          updatedAt: serverTimestamp(),
        });
        toast.success("Task deleted");
        setDetailModalOpen(false);
      } catch (err) {
        console.error("Error deleting task:", err);
        toast.error("Could not delete task.");
      }
    }
  };

  // Add subtask in detail modal
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim() || !selectedTask) return;
    const nextSubtasks = [
      ...(selectedTask.subtasks || []),
      { title: newSubtaskTitle.trim(), done: false },
    ];
    setSelectedTask({ ...selectedTask, subtasks: nextSubtasks });
    setNewSubtaskTitle("");
  };

  // Toggle subtask done in detail modal
  const handleToggleSubtask = (index: number) => {
    if (!selectedTask) return;
    const nextSubtasks = (selectedTask.subtasks || []).map((s, i) =>
      i === index ? { ...s, done: !s.done } : s,
    );
    setSelectedTask({ ...selectedTask, subtasks: nextSubtasks });
  };

  // Delete subtask in detail modal
  const handleDeleteSubtask = (index: number) => {
    if (!selectedTask) return;
    const nextSubtasks = (selectedTask.subtasks || []).filter(
      (_, i) => i !== index,
    );
    setSelectedTask({ ...selectedTask, subtasks: nextSubtasks });
  };

  // Handle Quick Add Task Submit
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || !currentUser) return;

    try {
      await addDoc(collection(db, "tasks"), {
        userId: currentUser.uid,
        title: quickTitle.trim(),
        description: quickDescription.trim(),
        dueDate: quickAddDate,
        category: quickCategory,
        priority: quickPriority,
        status: "todo",
        subtasks: [],
        deleted: false,
        createdAt: serverTimestamp(),
      });
      toast.success("✨ Task added directly!");
      setQuickAddOpen(false);
    } catch (err) {
      console.error("Failed to quick add task:", err);
      toast.error("Could not create task.");
    }
  };

  // Build My Schedule via Gemini AI
  const handleBuildSchedule = async () => {
    if (!schedulePrompt.trim() || !currentUser) return;

    setBuildingSchedule(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const dayOfWeek = format(new Date(), "EEEE");

    const prompt = `Today is ${today} (${dayOfWeek}). The user says: '${schedulePrompt}'. Create an optimal schedule for the next 7 days. Return JSON: { blocks: [{title: string, date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM', type: 'task|study|break|meeting', priority: 'high|medium|low'}] }. Schedule work 9am-10pm, breaks every 2 hours, harder tasks in morning.`;

    try {
      const response = await askGeminiJSON(prompt);

      if (response && response.blocks && Array.isArray(response.blocks)) {
        const promises = response.blocks.map((block: any) => {
          return addDoc(collection(db, "tasks"), {
            userId: currentUser.uid,
            title: block.title.startsWith("✨")
              ? block.title
              : `✨ ${block.title}`,
            dueDate: block.date,
            priority: block.priority || "medium",
            category:
              block.type === "meeting"
                ? "work"
                : block.type === "study"
                  ? "study"
                  : "personal",
            status: "todo",
            isAIGenerated: true,
            deleted: false,
            description: `AI Scheduled Block: ${block.startTime} - ${block.endTime} (${block.type})`,
            createdAt: serverTimestamp(),
          });
        });

        await Promise.all(promises);
        toast.success(
          `✅ Schedule built! ${response.blocks.length} blocks added to your calendar.`,
        );
        setSchedulePrompt("");
      } else {
        toast.error("Received unexpected answer from AI. Please try again.");
      }
    } catch (err) {
      console.error("Error building AI schedule:", err);
      toast.error(
        "Flow failed to compile your weekly schedule. Let's try again.",
      );
    } finally {
      setBuildingSchedule(false);
    }
  };

  // Find Focus Time via Gemini AI
  const handleFindFocusTime = async () => {
    if (!currentUser) return;

    setFindingFocus(true);
    const todayDateStr = format(new Date(), "yyyy-MM-dd");
    const todayTasksList = tasks.filter(
      (t) => t.dueDate === todayDateStr && t.deleted !== true,
    );
    const todayTasksStr =
      todayTasksList.map((t) => `${t.title} (${t.status})`).join(", ") ||
      "No tasks scheduled";

    const prompt = `Today is ${todayDateStr}. User works 09:00 to 18:00. Their scheduled tasks today: ${todayTasksStr}. Find 3 best focus time slots for ${focusDuration} minutes of deep work. Avoid right after meals (1-2pm) unless no other option. Return JSON: { slots: [{date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM', reason: string}] }`;

    try {
      const response = await askGeminiJSON(prompt);
      if (response && response.slots && Array.isArray(response.slots)) {
        setFocusSlots(response.slots);
        toast.success("🔍 3 Optimal Focus Blocks found!");
      } else {
        toast.error("No compatible focus slots found. Try changing duration.");
      }
    } catch (err) {
      console.error("Focus finder error:", err);
      toast.error("Could not find Focus Slots at this time.");
    } finally {
      setFindingFocus(false);
    }
  };

  // Book a found Focus Slot
  const handleBookFocusSlot = async (slot: FocusSlot) => {
    if (!currentUser) return;

    try {
      await addDoc(collection(db, "tasks"), {
        userId: currentUser.uid,
        title: `✨ Focus: Deep Work Block`,
        dueDate: slot.date,
        priority: "high",
        category: "work",
        status: "todo",
        isAIGenerated: true,
        deleted: false,
        description: `Focus session from ${slot.startTime} to ${slot.endTime}. Reason: ${slot.reason}`,
        createdAt: serverTimestamp(),
      });
      toast.success(
        `✅ Focus slot booked on ${slot.date} at ${slot.startTime}!`,
      );
      // Remove booked slot from selection
      setFocusSlots(
        focusSlots.filter(
          (s) => !(s.startTime === slot.startTime && s.date === slot.date),
        ),
      );
    } catch (err) {
      console.error("Failed to book focus block:", err);
      toast.error("Could not book Focus session.");
    }
  };

  // ICS Export Handler
  const handleExportICS = () => {
    const activeTasks = tasks.filter((t) => t.deleted !== true);
    if (activeTasks.length === 0) {
      toast.error("No active tasks to export.");
      return;
    }

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FlowMind//EN",
      ...activeTasks.map((t) => {
        let parsedDate = parseDueDate(t.dueDate);
        if (!parsedDate || isNaN(parsedDate.getTime())) {
          parsedDate = new Date();
        }
        const dateFormatted = format(parsedDate, "yyyyMMdd'T'090000");
        return [
          "BEGIN:VEVENT",
          `DTSTART:${dateFormatted}`,
          `SUMMARY:${t.title}`,
          `DESCRIPTION:${t.category} - ${t.priority} priority`,
          "END:VEVENT",
        ].join("\n");
      }),
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `flowmind-calendar.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("📅 Manual ICS Export completed!");
  };

  // Custom Toolbar component inside react-big-calendar
  const CustomToolbar = (toolbarProps: any) => {
    const goToBack = () => {
      toolbarProps.onNavigate("PREV");
    };
    const goToNext = () => {
      toolbarProps.onNavigate("NEXT");
    };
    const goToCurrent = () => {
      toolbarProps.onNavigate("TODAY");
    };

    const label = toolbarProps.label;

    return (
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        {/* Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToBack}
            className="p-2 bg-card hover:bg-surface border border-surface rounded-xl text-text hover:text-primary transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToCurrent}
            className="px-4 py-2 bg-card hover:bg-surface border border-surface rounded-xl text-xs font-bold text-text hover:text-primary transition-all cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={goToNext}
            className="p-2 bg-card hover:bg-surface border border-surface rounded-xl text-text hover:text-primary transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Big Date Display */}
        <h2 className="text-xl font-bold font-display text-text text-center capitalize tracking-wide">
          {label}
        </h2>

        {/* View Switchers */}
        <div className="flex bg-card p-1 rounded-xl border border-surface">
          {["month", "week", "day", "agenda"].map((view) => (
            <button
              key={view}
              onClick={() => toolbarProps.onView(view)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                toolbarProps.view === view
                  ? "bg-primary text-white shadow-md"
                  : "text-muted hover:text-text"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-surface pb-6">
        <div>
          <h2 className="text-3xl font-bold font-display text-text tracking-wide flex items-center gap-2.5">
            <CalendarIcon className="w-8 h-8 text-primary" />
            Interactive Calendar
          </h2>
          <p className="text-sm text-muted mt-1">
            Drag-and-drop tasks, book optimal sessions, and manage your
            cognitive schedule seamlessly.
          </p>
        </div>

        <button
          onClick={handleExportICS}
          className="flex items-center gap-2 px-5 py-2.5 bg-card hover:bg-surface border border-surface hover:border-primary/40 text-text hover:text-primary text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export to Google Calendar
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" strokeWidth={1.5} />
          <p className="text-xs text-muted font-medium tracking-wide">
            Syncing with Flow Database...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* MAIN CALENDAR - 2/3 COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            <div className="premium-card p-6 overflow-hidden">
              <DnDCalendar
                localizer={localizer}
                events={events}
                startAccessor={(event: any) => event.start}
                endAccessor={(event: any) => event.end}
                style={{ height: 600 }}
                onEventDrop={handleEventDrop}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                selectable
                eventPropGetter={eventPropGetter}
                views={["month", "week", "day", "agenda"]}
                view={currentView}
                onView={(v) => setCurrentView(v)}
                date={currentDate}
                onNavigate={(d) => setCurrentDate(d)}
                components={{
                  toolbar: CustomToolbar,
                }}
              />
            </div>

            {/* AI SCHEDULE BUILDER PANEL */}
            <div className="premium-card overflow-hidden">
              <button
                onClick={() => setIsSchedulePanelOpen(!isSchedulePanelOpen)}
                className="w-full px-6 py-4 flex items-center justify-between bg-surface/50 border-b border-white/5 hover:bg-surface transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />
                  <h3 className="section-eyebrow text-text">
                    ✨ AI Schedule Builder
                  </h3>
                </div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-muted bg-card px-2 py-0.5 rounded border border-surface">
                  {isSchedulePanelOpen ? "Collapse" : "Expand"}
                </div>
              </button>

              <AnimatePresence>
                {isSchedulePanelOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 space-y-5"
                  >
                    <p className="text-xs text-muted leading-relaxed">
                      Need a structured week? Flow builds an optimized calendar
                      using productivity best practices like morning work blocks
                      and timely break periods.
                    </p>

                    <textarea
                      value={schedulePrompt}
                      onChange={(e) => setSchedulePrompt(e.target.value)}
                      placeholder="Describe your week... (e.g. 'I have a presentation Monday, 3 assignments due Thursday, need to study for exam Friday')"
                      rows={3}
                      disabled={buildingSchedule}
                      className="w-full bg-background border border-surface rounded-xl p-4 text-[13px] text-text placeholder-muted focus:outline-none focus:border-primary/50 shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)] resize-none leading-relaxed"
                    />

                    <button
                      onClick={handleBuildSchedule}
                      disabled={buildingSchedule || !schedulePrompt.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-[13px] font-bold rounded-xl shadow-[0_4px_12px_rgba(124,110,240,0.3)] hover:shadow-[0_8px_24px_rgba(124,110,240,0.4)] hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      {buildingSchedule ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Flow is building your schedule...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Build My Schedule
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* FOCUS TIME FINDER & STATS - 1/3 COLUMN */}
          <div className="space-y-6">
            {/* FOCUS TIME FINDER CARD */}
            <div className="premium-card p-6 space-y-6">
              <div className="flex items-center gap-2.5 border-b border-white/5 pb-4">
                <Flame className="w-5 h-5 text-accent" strokeWidth={2} />
                <h3 className="section-eyebrow text-text">
                  Find Focus Time
                </h3>
              </div>

              <div className="space-y-5">
                <p className="text-xs text-muted leading-relaxed">
                  Analyze today's task density and work schedule to locate
                  high-focus spaces for uninterrupted deep work.
                </p>

                {/* Duration select */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-muted">
                    Focus Duration
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[25, 45, 90].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setFocusDuration(mins)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          focusDuration === mins
                            ? "bg-accent/10 border-accent/30 text-accent shadow-inner"
                            : "bg-surface border-transparent text-text hover:border-surface"
                        }`}
                      >
                        {mins} Min
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleFindFocusTime}
                  disabled={findingFocus}
                  className="w-full py-3 bg-accent/90 hover:bg-accent text-card text-[13px] font-bold rounded-xl shadow-[0_4px_12px_rgba(240,165,0,0.3)] hover:shadow-[0_8px_24px_rgba(240,165,0,0.4)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {findingFocus ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing Schedule...
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4" strokeWidth={2} />
                      Find Best Slots
                    </>
                  )}
                </button>
              </div>

              {/* Focus Slots results */}
              {focusSlots.length > 0 && (
                <div className="space-y-3 pt-5 border-t border-white/5">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted">
                    Recommended Slots
                  </p>

                  <div className="space-y-3">
                    {focusSlots.map((slot, index) => (
                      <div
                        key={index}
                        className="bg-surface/50 border border-white/5 hover:border-accent/30 p-4 rounded-2xl space-y-3 transition-all"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] font-bold text-text flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
                            {slot.startTime} - {slot.endTime}
                          </span>
                          <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                            {slot.date}
                          </span>
                        </div>
                        <p className="text-xs text-muted leading-relaxed">
                          "{slot.reason}"
                        </p>
                        <button
                          onClick={() => handleBookFocusSlot(slot)}
                          className="w-full py-2 bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 text-accent text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                        >
                          Book This Slot
                          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* COLOR LEGEND CARD */}
            <div className="premium-card p-6 space-y-4">
              <h3 className="section-eyebrow">
                Calendar Legend
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2.5 bg-background border border-white/5 rounded-xl shadow-inner">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 shadow-[0_0_8px_currentColor]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text">
                    Upcoming
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-background border border-white/5 rounded-xl shadow-inner">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0 shadow-[0_0_8px_currentColor]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text">Today</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-background border border-white/5 rounded-xl shadow-inner">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0 shadow-[0_0_8px_currentColor]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text">
                    Overdue
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-background border border-white/5 rounded-xl shadow-inner">
                  <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0 shadow-[0_0_8px_currentColor]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text">
                    Completed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD TASK MODAL */}
      <AnimatePresence>
        {quickAddOpen && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-surface rounded-2xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setQuickAddOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-surface hover:bg-surface-hover border border-surface rounded-lg text-muted hover:text-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 border-b border-surface pb-4 mb-4">
                <Plus className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base font-display text-text">
                  Quick Add Task
                </h3>
              </div>

              <form onSubmit={handleQuickAddSubmit} className="space-y-4">
                <div>
                  <label className="text-xxs uppercase font-mono text-muted block mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="E.g., Complete UI mockups"
                    className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary focus:shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Category
                    </label>
                    <select
                      value={quickCategory}
                      onChange={(e) =>
                        setQuickCategory(e.target.value as Category)
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary capitalize"
                    >
                      {["study", "work", "personal", "finance", "health"].map(
                        (cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Priority
                    </label>
                    <select
                      value={quickPriority}
                      onChange={(e) =>
                        setQuickPriority(e.target.value as Priority)
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary capitalize"
                    >
                      {["critical", "high", "medium", "low"].map((prio) => (
                        <option key={prio} value={prio}>
                          {prio}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xxs uppercase font-mono text-muted block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={quickAddDate}
                    onChange={(e) => setQuickAddDate(e.target.value)}
                    className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xxs uppercase font-mono text-muted block mb-1">
                    Description
                  </label>
                  <textarea
                    value={quickDescription}
                    onChange={(e) => setQuickDescription(e.target.value)}
                    placeholder="Provide context or instructions..."
                    rows={3}
                    className="w-full bg-surface border border-surface rounded-xl p-3 text-xs text-text focus:outline-none focus:border-primary focus:shadow-inner resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Create Task
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TASK DETAIL MODAL */}
      <AnimatePresence>
        {detailModalOpen && selectedTask && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setDetailModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-surface hover:bg-surface-hover border border-surface rounded-lg text-muted hover:text-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="border-b border-surface pb-4 mb-4">
                <span className="text-xxs font-bold uppercase font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {selectedTask.isAIGenerated ? "✨ AI Block" : "Task Details"}
                </span>
                <input
                  type="text"
                  value={selectedTask.title}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, title: e.target.value })
                  }
                  className="w-full bg-transparent border-none text-lg font-bold text-text focus:outline-none mt-2 font-display"
                />
              </div>

              <div className="space-y-4">
                {/* Form fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Status
                    </label>
                    <select
                      value={selectedTask.status}
                      onChange={(e) =>
                        setSelectedTask({
                          ...selectedTask,
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary capitalize font-medium"
                    >
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="done">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={selectedTask.dueDate || ""}
                      onChange={(e) =>
                        setSelectedTask({
                          ...selectedTask,
                          dueDate: e.target.value,
                        })
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Priority
                    </label>
                    <select
                      value={selectedTask.priority}
                      onChange={(e) =>
                        setSelectedTask({
                          ...selectedTask,
                          priority: e.target.value as Priority,
                        })
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary capitalize font-medium"
                    >
                      {["critical", "high", "medium", "low"].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xxs uppercase font-mono text-muted block mb-1">
                      Category
                    </label>
                    <select
                      value={selectedTask.category}
                      onChange={(e) =>
                        setSelectedTask({
                          ...selectedTask,
                          category: e.target.value as Category,
                        })
                      }
                      className="w-full bg-surface border border-surface rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-primary capitalize font-medium"
                    >
                      {["study", "work", "personal", "finance", "health"].map(
                        (cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xxs uppercase font-mono text-muted block mb-1">
                    Description
                  </label>
                  <textarea
                    value={selectedTask.description || ""}
                    onChange={(e) =>
                      setSelectedTask({
                        ...selectedTask,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full bg-surface border border-surface rounded-xl p-3 text-xs text-text focus:outline-none focus:border-primary focus:shadow-inner resize-none"
                  />
                </div>

                {/* Subtask checklist */}
                <div className="border-t border-surface/50 pt-4 space-y-3">
                  <h4 className="text-xs font-bold font-display text-text">
                    Subtasks checklist (
                    {selectedTask.subtasks?.filter((s) => s.done).length || 0} /{" "}
                    {selectedTask.subtasks?.length || 0})
                  </h4>

                  {/* Add subtask */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add subtask..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()}
                      className="flex-1 bg-surface border border-surface rounded-xl px-3 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleAddSubtask}
                      className="px-3.5 py-1.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-hover transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Subtask list */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {(selectedTask.subtasks || []).map((sub, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 p-2 bg-surface rounded-xl border border-surface"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={sub.done}
                            onChange={() => handleToggleSubtask(i)}
                            className="w-4 h-4 text-primary bg-surface border-surface focus:ring-0 rounded cursor-pointer"
                          />
                          <span
                            className={`text-xs truncate ${sub.done ? "line-through text-muted" : "text-text font-medium"}`}
                          >
                            {sub.title}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteSubtask(i)}
                          className="p-1 hover:bg-danger/10 text-muted hover:text-danger rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom action controls */}
                <div className="flex gap-2 pt-4 border-t border-surface/50">
                  <button
                    onClick={handleSaveDetailTask}
                    className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleDeleteDetailTask}
                    className="px-4 py-2.5 bg-danger/15 hover:bg-danger/25 border border-danger/30 text-danger text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Delete Task
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
