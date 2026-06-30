import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { format, formatDistanceToNow, isToday, isPast } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Play,
  RefreshCw,
  X,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Circle,
  Bot,
  CheckSquare,
} from "lucide-react";
import { askGeminiJSON, askGemini } from "../lib/gemini";
import toast from "react-hot-toast";
import { useFocusMode } from "../components/FocusMode";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import {
  generateSystemNotifications,
  requestPermission,
  scheduleDeadlineNotifications,
} from "../lib/notifications";

export const parseDueDate = (dueDate: any): Date | null => {
  if (!dueDate) return null;
  if (dueDate.toDate && typeof dueDate.toDate === "function") {
    return dueDate.toDate();
  }
  if (dueDate.seconds) {
    return new Date(dueDate.seconds * 1000);
  }
  return new Date(dueDate);
};

// Helper hook for counting up numbers
function useCountUp(end: number, duration: number = 1000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [end, duration]);

  return count;
}

export function Dashboard() {
  const { currentUser, userProfile } = useAuth();
  const { startFocusSession } = useFocusMode();

  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    dueToday: 0,
    overdue: 0,
    doneWeek: 0,
  });
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [habits, setHabits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  useEffect(() => {
    const handleOpenQuickAdd = () => {
      setIsQuickAddOpen(true);
    };
    window.addEventListener("open-quick-add", handleOpenQuickAdd);
    return () =>
      window.removeEventListener("open-quick-add", handleOpenQuickAdd);
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const fetchDashboardData = async () => {
      try {
        let tasksData = [];
        let habitsData = [];
        let allTasksSize = 0;
        let dueToday = 0;
        let overdue = 0;

        try {
          // Fetch tasks from Firestore
          const tasksQuery = query(
            collection(db, "tasks"),
            where("userId", "==", currentUser.uid),
            where("status", "!=", "done"),
            orderBy("dueDate", "asc"),
            limit(20),
          );
          const tasksSnapshot = await getDocs(tasksQuery);
          tasksData = tasksSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          // Fetch stats (simplified for now)
          const allTasksQuery = query(
            collection(db, "tasks"),
            where("userId", "==", currentUser.uid),
          );
          const allTasksSnap = await getDocs(allTasksQuery);
          allTasksSize = allTasksSnap.size;

          let doneTasksToday = 0;
          allTasksSnap.forEach((doc) => {
            const t = doc.data();
            if (t.status === "done" && t.updatedAt) {
              const updatedDate = parseDueDate(t.updatedAt);
              if (updatedDate && isToday(updatedDate)) doneTasksToday++;
            } else if (t.status !== "done" && t.dueDate) {
              const date = parseDueDate(t.dueDate);
              if (date) {
                if (isToday(date)) dueToday++;
                else if (isPast(date)) overdue++;
              }
            }
          });

          // Generate system notifications and schedule deadlines
          requestPermission().then((granted) => {
            if (granted) {
              scheduleDeadlineNotifications(tasksData);
            }
          });
          generateSystemNotifications(tasksData, currentUser, doneTasksToday);

          // Cache in local storage for fallback
          localStorage.setItem(
            `local_tasks_${currentUser.uid}`,
            JSON.stringify(tasksData),
          );
        } catch (dbErr) {
          console.warn(
            "Firestore tasks query failed, falling back to local storage:",
            dbErr,
          );
          const cachedTasksStr = localStorage.getItem(
            `local_tasks_${currentUser.uid}`,
          );
          if (cachedTasksStr) {
            const cachedTasks = JSON.parse(cachedTasksStr);
            tasksData = cachedTasks.filter((t: any) => t.status !== "done");
            allTasksSize = cachedTasks.length;
            cachedTasks.forEach((t: any) => {
              if (t.status !== "done" && t.dueDate) {
                const date = parseDueDate(t.dueDate);
                if (date) {
                  if (isToday(date)) dueToday++;
                  else if (isPast(date)) overdue++;
                }
              }
            });
          } else {
            // Seed some default local tasks for the new user
            const defaultTasks = [
              {
                id: "task_1",
                userId: currentUser.uid,
                title: "Review weekly design feedback",
                dueDate: new Date(
                  new Date().setHours(17, 0, 0, 0),
                ).toISOString(),
                priority: "High",
                category: "Work",
                status: "todo",
                createdAt: new Date().toISOString(),
              },
              {
                id: "task_2",
                userId: currentUser.uid,
                title: "Plan quarterly roadmap",
                dueDate: new Date(
                  new Date().setDate(new Date().getDate() + 1),
                ).toISOString(),
                priority: "Medium",
                category: "Work",
                status: "todo",
                createdAt: new Date().toISOString(),
              },
            ];
            localStorage.setItem(
              `local_tasks_${currentUser.uid}`,
              JSON.stringify(defaultTasks),
            );
            tasksData = defaultTasks;
            allTasksSize = defaultTasks.length;
            dueToday = 1;
          }
        }

        setTasks(tasksData);

        setStats({
          total: allTasksSize,
          dueToday,
          overdue,
          doneWeek: userProfile?.stats?.tasksCompleted || 0,
        });

        try {
          // Fetch habits
          const habitsQuery = query(
            collection(db, "habits"),
            where("userId", "==", currentUser.uid),
          );
          const habitsSnap = await getDocs(habitsQuery);
          if (habitsSnap.empty) {
            // seed habits for demo
            const demoHabits = [
              {
                userId: currentUser.uid,
                name: "Read 30 mins",
                streak: 5,
                completedToday: false,
              },
              {
                userId: currentUser.uid,
                name: "Workout",
                streak: 12,
                completedToday: true,
              },
              {
                userId: currentUser.uid,
                name: "Meditation",
                streak: 2,
                completedToday: false,
              },
            ];
            const newHabits = [];
            for (const h of demoHabits) {
              const docRef = await addDoc(collection(db, "habits"), h);
              newHabits.push({ id: docRef.id, ...h });
            }
            habitsData = newHabits;
          } else {
            habitsData = habitsSnap.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
          }
          localStorage.setItem(
            `local_habits_${currentUser.uid}`,
            JSON.stringify(habitsData),
          );
        } catch (dbErr) {
          console.warn(
            "Firestore habits query failed, falling back to local storage:",
            dbErr,
          );
          const cachedHabitsStr = localStorage.getItem(
            `local_habits_${currentUser.uid}`,
          );
          if (cachedHabitsStr) {
            habitsData = JSON.parse(cachedHabitsStr);
          } else {
            const demoHabits = [
              {
                id: "habit_1",
                userId: currentUser.uid,
                name: "Read 30 mins",
                streak: 5,
                completedToday: false,
              },
              {
                id: "habit_2",
                userId: currentUser.uid,
                name: "Workout",
                streak: 12,
                completedToday: true,
              },
              {
                id: "habit_3",
                userId: currentUser.uid,
                name: "Meditation",
                streak: 2,
                completedToday: false,
              },
            ];
            localStorage.setItem(
              `local_habits_${currentUser.uid}`,
              JSON.stringify(demoHabits),
            );
            habitsData = demoHabits;
          }
        }

        setHabits(habitsData);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [currentUser]);

  useEffect(() => {
    if (tasks.length >= 0 && !briefing && !loading) {
      generateBriefing();
    }
  }, [tasks, loading]);

  const generateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const top5Tasks = tasks
        .slice(0, 5)
        .map((t) => ({ title: t.title, priority: t.priority }));
      const prompt = `Today is ${format(new Date(), "PPpp")}. ${userProfile?.displayName} is a ${userProfile?.role}. They have these tasks: ${JSON.stringify(top5Tasks)}. Write a 3-sentence morning briefing: mention their top priority, give one specific time-management tip for today, and end with a motivational line. Keep it under 80 words.`;

      const systemInstruction =
        "You are Flow, an AI productivity coach. Be warm, direct, and motivating. No markdown formatting, just plain text.";
      const response = await askGemini(prompt, systemInstruction);
      setBriefing(response);
    } catch (error) {
      console.error("Error generating briefing:", error);
      setBriefing(
        "Good morning! Ready to tackle today's goals? Let's prioritize your top task and build some momentum.",
      );
    } finally {
      setLoadingBriefing(false);
    }
  };

  const toggleHabit = async (
    habitId: string,
    currentStatus: boolean,
    currentStreak: number,
  ) => {
    const newStatus = !currentStatus;
    const newStreak = newStatus
      ? currentStreak + 1
      : Math.max(0, currentStreak - 1);

    const updatedHabits = habits.map((h) =>
      h.id === habitId
        ? { ...h, completedToday: newStatus, streak: newStreak }
        : h,
    );
    setHabits(updatedHabits);
    localStorage.setItem(
      `local_habits_${currentUser.uid}`,
      JSON.stringify(updatedHabits),
    );

    try {
      if (habitId && !habitId.startsWith("habit_")) {
        await updateDoc(doc(db, "habits", habitId), {
          completedToday: newStatus,
          streak: newStreak,
        });
      }
    } catch (error) {
      console.error("Error updating habit in Firestore:", error);
    }
  };

  const topTask = tasks[0];

  return (
    <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
      {/* 1. Today's Focus Card */}
      <section>
        <div className="premium-card p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-primary/20 transition-colors duration-500"></div>

          <h3 className="section-eyebrow mb-4">
            Today's Focus
          </h3>

          {topTask ? (
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex-1">
                <h2 className="text-h1 text-text mb-4">
                  {topTask.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-[13px] font-semibold">
                  {topTask.dueDate && (
                    <span className="flex items-center gap-1.5 text-accent bg-accent/10 px-3 py-1.5 rounded-md">
                      <Clock className="w-4 h-4" strokeWidth={2} />
                      Due{" "}
                      {formatDistanceToNow(parseDueDate(topTask.dueDate)!, {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                  {topTask.priority && (
                    <span
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
                        topTask.priority === "critical" || topTask.priority === "High"
                          ? "bg-danger/10 text-danger"
                          : topTask.priority === "high" || topTask.priority === "Medium"
                            ? "bg-accent/10 text-accent"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                      {topTask.priority} Priority
                    </span>
                  )}
                </div>

                {/* Progress bar mock for subtasks */}
                {topTask.subtasks && topTask.subtasks.length > 0 && (
                  <div className="mt-8 max-w-md">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
                      <span>Progress</span>
                      <span className="text-text">
                        {Math.round(
                          (topTask.subtasks.filter((s: any) => s.done).length /
                            topTask.subtasks.length) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(topTask.subtasks.filter((s: any) => s.done).length / topTask.subtasks.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => toast.success("Focus Mode coming soon!")}
                className="group/btn relative flex items-center justify-center gap-2 px-8 py-4 bg-text text-background font-bold rounded-xl overflow-hidden shadow-[0_4px_14px_0_rgba(255,255,255,0.1)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 shrink-0"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-out"></div>
                <Play className="w-5 h-5 fill-current relative z-10" />
                <span className="relative z-10">Start Focus</span>
              </button>
            </div>
          ) : (
            <div className="text-center py-10 relative z-10">
              <p className="text-lg text-muted font-medium mb-6">
                Your slate is clean. Tell Flow what's next.
              </p>
              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="w-5 h-5" strokeWidth={2} />
                Add Task
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 space-y-6 md:space-y-8">
          {/* 2. Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Tasks" value={stats.total} />
            <StatCard label="Due Today" value={stats.dueToday} />
            <StatCard
              label="Overdue"
              value={stats.overdue}
              valueColor="text-danger"
              bgClass={stats.overdue > 0 ? "bg-danger/5 border-danger/20" : ""}
            />
            <StatCard
              label="Done Week"
              value={stats.doneWeek}
              valueColor="text-success"
            />
          </div>

          {/* 3. AI Daily Briefing Card */}
          <div className="premium-card p-6 md:p-8 relative">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Bot className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-bold text-text">Flow</h3>
                  <div className="text-[11px] text-muted font-medium uppercase tracking-wider">Daily Briefing</div>
                </div>
              </div>
              <button
                onClick={generateBriefing}
                disabled={loadingBriefing}
                className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-full transition-all disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingBriefing ? "animate-spin" : ""}`}
                  strokeWidth={2}
                />
              </button>
            </div>

            {loadingBriefing ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-4 bg-surface rounded w-3/4"></div>
                <div className="h-4 bg-surface rounded w-full"></div>
                <div className="h-4 bg-surface rounded w-5/6"></div>
              </div>
            ) : (
              <p className="text-text leading-relaxed">
                {briefing}
              </p>
            )}
          </div>

          {/* 5. Habit Tracker Row */}
          <div>
            <h3 className="section-eyebrow mb-4">
              Daily Habits
            </h3>
            {habits.length === 0 ? (
              <EmptyState
                icon={
                  <CalendarIcon className="w-12 h-12 text-primary/50 mx-auto" strokeWidth={1.5} />
                }
                title="Start your first habit"
                description="Create daily habits to build consistency over time."
              />
            ) : (
              <div className="flex flex-wrap gap-4">
                {habits.map((habit) => (
                  <button
                    key={habit.id}
                    onClick={() =>
                      toggleHabit(habit.id, habit.completedToday, habit.streak)
                    }
                    className={`flex items-center gap-3 p-3 pr-5 rounded-2xl border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      habit.completedToday
                        ? "bg-success/5 border-success/20 shadow-success/5"
                        : "bg-card border-surface hover:border-primary/30 shadow-black/20"
                    }`}
                  >
                    {habit.completedToday ? (
                      <CheckCircle2 className="w-6 h-6 shrink-0 text-success" strokeWidth={1.5} />
                    ) : (
                      <Circle className="w-6 h-6 shrink-0 text-muted" strokeWidth={1.5} />
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <div className={`font-semibold truncate transition-colors ${habit.completedToday ? "text-success" : "text-text"}`}>{habit.name}</div>
                      <div
                        className={`text-[11px] uppercase tracking-wider font-bold mt-0.5 ${habit.completedToday ? "text-success/70" : "text-muted"}`}
                      >
                        🔥 {habit.streak} day streak
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 md:space-y-8">
          {/* 4. Upcoming Deadlines */}
          <div className="premium-card p-6">
            <h3 className="flex items-center justify-between mb-6">
              <span className="section-eyebrow">Upcoming Deadlines</span>
              <Link
                to="/tasks"
                className="text-[12px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
              >
                View All
              </Link>
            </h3>

            <div className="space-y-2">
              {tasks.length > 0 ? (
                <AnimatePresence>
                  {tasks.slice(0, 5).map((task, i) => {
                    const date = parseDueDate(task.dueDate);
                    const isTaskOverdue =
                      date && isPast(date) && !isToday(date);
                    const isTaskToday = date && isToday(date);
                    const dotColor = isTaskOverdue
                      ? "bg-danger"
                      : isTaskToday
                        ? "bg-accent"
                        : "bg-primary";

                    return (
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, ease: "easeOut" }}
                        className="flex items-center justify-between p-3.5 rounded-xl hover:bg-surface transition-colors group relative"
                      >
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full mt-2 shrink-0 ${dotColor} shadow-[0_0_8px_currentColor]`}
                          ></div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-text truncate group-hover:text-primary transition-colors">
                              {task.title}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-medium text-muted uppercase tracking-wider">
                              {date && (
                                <span className="flex items-center gap-1.5">
                                  <CalendarIcon className="w-3.5 h-3.5" strokeWidth={2} />
                                  {format(date, "MMM d, h:mm a")}
                                </span>
                              )}
                              {task.category && (
                                <span className="px-2 py-0.5 rounded bg-surface border border-white/5">
                                  {task.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => startFocusSession(task)}
                          className="p-2 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0 ml-2"
                          title="Start Focus Session"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <EmptyState
                  icon={
                    <CheckSquare className="w-10 h-10 text-primary/50 mx-auto" strokeWidth={1.5} />
                  }
                  title="All Caught Up"
                  description="No upcoming deadlines found."
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Quick Add FAB (Desktop) */}
      <button
        onClick={() => setIsQuickAddOpen(true)}
        className="hidden md:flex fixed bottom-8 right-8 w-14 h-14 bg-primary text-white rounded-full items-center justify-center shadow-[0_4px_20px_rgba(124,110,240,0.4)] hover:shadow-[0_8px_30px_rgba(124,110,240,0.6)] hover:-translate-y-1 transition-all duration-300 z-30"
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
      </button>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAdded={() => {
          setIsQuickAddOpen(false);
          // Refetch tasks (in a real app, use SWR or React Query, or update local state)
          window.location.reload();
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  valueColor = "text-text",
  bgClass = "",
}: {
  label: string;
  value: number;
  valueColor?: string;
  bgClass?: string;
}) {
  const animatedValue = useCountUp(value, 1500);
  return (
    <div className={`premium-card p-4 flex flex-col justify-center ${bgClass || ""}`}>
      <div className="section-eyebrow mb-2">{label}</div>
      <div className={`text-3xl font-bold font-display tabular-stats ${valueColor}`}>
        {animatedValue}
      </div>
    </div>
  );
}

function QuickAddModal({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [category, setCategory] = useState("Work");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDueDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setPriority("Medium");
      setCategory("Work");
    }
  }, [isOpen]);

  const handleAIPlan = async () => {
    if (!title.trim()) return toast.error("Enter a task title first");
    setIsPlanning(true);
    try {
      const prompt = `Analyze this task: "${title}". Current date is ${new Date().toISOString()}. Suggest a JSON object with: 
      - priority ("High", "Medium", "Low")
      - category (e.g., "Work", "Personal", "Study", "Health")
      - estimatedDaysFromNow (number of days from today this should be due, 0 for today)`;

      const res = await askGeminiJSON(prompt);

      if (res.priority) setPriority(res.priority);
      if (res.category) setCategory(res.category);
      if (res.estimatedDaysFromNow !== undefined) {
        const d = new Date();
        d.setDate(d.getDate() + res.estimatedDaysFromNow);
        d.setHours(17, 0, 0, 0); // Default to 5 PM
        setDueDate(format(d, "yyyy-MM-dd'T'HH:mm"));
      }
      toast.success("AI configured task details");
    } catch (error) {
      toast.error("AI planning failed");
    } finally {
      setIsPlanning(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !currentUser) return;
    setIsSaving(true);

    const newTask: any = {
      id: "task_" + Math.random().toString(36).substring(2, 11),
      userId: currentUser.uid,
      title,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      priority,
      category,
      status: "todo",
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(collection(db, "tasks"), {
        userId: currentUser.uid,
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority,
        category,
        status: "todo",
        createdAt: serverTimestamp(),
      });
      newTask.id = docRef.id;
    } catch (error) {
      console.warn("Failed to add task to Firestore, adding locally:", error);
    }

    // Always update local cache so dashboard shows it instantly
    const cachedTasksStr =
      localStorage.getItem(`local_tasks_${currentUser.uid}`) || "[]";
    try {
      const cachedTasks = JSON.parse(cachedTasksStr);
      cachedTasks.push(newTask);
      localStorage.setItem(
        `local_tasks_${currentUser.uid}`,
        JSON.stringify(cachedTasks),
      );
    } catch (err) {
      console.error("Failed to save task locally:", err);
    }

    toast.success("Task added");
    onAdded();
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card border border-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-full"
      >
        <div className="p-6 border-b border-surface flex justify-between items-center">
          <h2 className="text-xl font-bold font-display text-text">Add Task</h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Task Title
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors"
                placeholder="What needs to be done?"
              />
              <button
                type="button"
                onClick={handleAIPlan}
                disabled={isPlanning}
                className="px-4 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-medium rounded-xl transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-50"
                title="Let AI suggest priority and due date"
              >
                <Bot className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isPlanning ? "Planning..." : "AI Plan It"}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Due Date
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors appearance-none"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-surface rounded-xl focus:border-primary focus:outline-none transition-colors"
              placeholder="e.g. Work, Personal, Study"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-surface text-text font-medium rounded-xl hover:bg-surface/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Add Task"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
