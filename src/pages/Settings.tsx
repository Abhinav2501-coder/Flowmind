import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Bell,
  Cpu,
  Database,
  Save,
  UploadCloud,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { uploadAvatar } from "../lib/supabase";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  deleteDoc,
  doc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { requestPermission } from "../lib/notifications";
import { askGemini } from "../lib/gemini";

export default function Settings() {
  const { userProfile, currentUser, updateProfileField, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  // Local state for debouncing
  const [prefs, setPrefs] = useState({
    workStartHour: userProfile?.preferences?.workStartHour || 9,
    workEndHour: userProfile?.preferences?.workEndHour || 18,
    timezone:
      userProfile?.preferences?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultPriority: userProfile?.preferences?.defaultPriority || "Medium",
    defaultFocusSession:
      userProfile?.preferences?.defaultFocusSession || "Pomodoro",
  });

  const [notifs, setNotifs] = useState({
    browserEnabled: userProfile?.notificationSettings?.browserEnabled || false,
    deadline24h: userProfile?.notificationSettings?.deadline24h ?? true,
    deadline1h: userProfile?.notificationSettings?.deadline1h ?? true,
    morningBriefingTime:
      userProfile?.notificationSettings?.morningBriefingTime || "08:00",
    streakReminders: userProfile?.notificationSettings?.streakReminders ?? true,
    achievementAlerts:
      userProfile?.notificationSettings?.achievementAlerts ?? true,
  });

  const [aiSettings, setAiSettings] = useState({
    personality: userProfile?.aiSettings?.personality || "Motivational",
    responseLength: userProfile?.aiSettings?.responseLength || "Balanced",
    language: userProfile?.aiSettings?.language || "English",
  });

  const [displayName, setDisplayName] = useState(
    userProfile?.displayName || "",
  );
  const [role, setRole] = useState(userProfile?.role || "Professional");

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [testingFlow, setTestingFlow] = useState(false);
  const [flowResponse, setFlowResponse] = useState("");

  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [clearTasksOpen, setClearTasksOpen] = useState(false);

  // Debounce effects for saving settings
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        userProfile &&
        (prefs.workStartHour !== userProfile.preferences?.workStartHour ||
          prefs.workEndHour !== userProfile.preferences?.workEndHour ||
          prefs.timezone !== userProfile.preferences?.timezone ||
          prefs.defaultPriority !== userProfile.preferences?.defaultPriority ||
          prefs.defaultFocusSession !==
            userProfile.preferences?.defaultFocusSession)
      ) {
        updateProfileField({ preferences: prefs }).then(() =>
          toast.success("Preferences saved"),
        );
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [prefs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        userProfile &&
        JSON.stringify(notifs) !==
          JSON.stringify(userProfile.notificationSettings)
      ) {
        updateProfileField({ notificationSettings: notifs }).then(() =>
          toast.success("Notification settings saved"),
        );
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [notifs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        userProfile &&
        JSON.stringify(aiSettings) !== JSON.stringify(userProfile.aiSettings)
      ) {
        updateProfileField({ aiSettings }).then(() =>
          toast.success("AI settings saved"),
        );
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [aiSettings]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(currentUser.uid, file);
      await updateProfileField({ avatarUrl: url });
      toast.success("Avatar updated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfileInfo = async () => {
    await updateProfileField({ displayName, role });
    toast.success("Profile information updated");
  };

  const handleBrowserNotifsToggle = async () => {
    if (!notifs.browserEnabled) {
      const granted = await requestPermission();
      if (granted) {
        setNotifs({ ...notifs, browserEnabled: true });
        toast.success("Notifications enabled!");
      } else {
        toast.error("Permission denied by browser");
      }
    } else {
      setNotifs({ ...notifs, browserEnabled: false });
    }
  };

  const testFlow = async () => {
    setTestingFlow(true);
    try {
      let maxTokens = 512;
      if (aiSettings.responseLength === "Brief") maxTokens = 256;
      if (aiSettings.responseLength === "Detailed") maxTokens = 1024;

      const systemInstruction = `You are Flow, an AI assistant.
Tone/Personality: ${aiSettings.personality}.
Language: ${aiSettings.language}.
Keep your response length ${aiSettings.responseLength}.`;

      const resp = await askGemini(
        "Say hello in 10 words",
        systemInstruction,
        maxTokens,
      );
      setFlowResponse(resp);
    } catch (err) {
      toast.error("Failed to test Flow");
    } finally {
      setTestingFlow(false);
    }
  };

  const exportTasksJSON = async () => {
    if (!currentUser) return;
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", currentUser.uid),
    );
    const snap = await getDocs(q);
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowmind_tasks.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Tasks exported as JSON");
  };

  const exportTasksCSV = async () => {
    if (!currentUser) return;
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", currentUser.uid),
    );
    const snap = await getDocs(q);
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (data.length === 0) {
      toast.error("No tasks to export");
      return;
    }

    const headers = [
      "id",
      "title",
      "status",
      "priority",
      "category",
      "dueDate",
      "createdAt",
    ];
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((fieldName) => {
            let val = (row as any)[fieldName];
            if (val && typeof val === "object" && val.seconds) {
              val = new Date(val.seconds * 1000).toISOString();
            }
            return `"${String(val || "").replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ];

    const blob = new Blob([csvRows.join("\\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowmind_tasks.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Tasks exported as CSV");
  };

  const clearCompletedTasks = async () => {
    if (!currentUser) return;
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", currentUser.uid),
      where("status", "==", "done"),
    );
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    setClearTasksOpen(false);
    toast.success(`Cleared ${snap.size} completed tasks`);
  };

  const deleteAccount = async () => {
    if (!currentUser) return;
    // Note: A real app would call a Cloud Function to clean up auth user + all data.
    // Here we just delete the user document and logout for preview purposes.
    try {
      await deleteDoc(doc(db, "users", currentUser.uid));
      await logout();
      toast.success("Account deleted");
    } catch (e) {
      toast.error("Failed to delete account");
    }
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    {
      id: "preferences",
      label: "Preferences",
      icon: <Save className="w-4 h-4" />,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: <Bell className="w-4 h-4" />,
    },
    { id: "ai", label: "AI Assistant", icon: <Cpu className="w-4 h-4" /> },
    {
      id: "data",
      label: "Data & Privacy",
      icon: <Database className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background custom-scrollbar relative">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display text-text">
            Settings
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage your account, preferences, and AI assistant behavior.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 shrink-0">
            <div className="flex md:flex-col overflow-x-auto custom-scrollbar pb-4 md:pb-0 gap-2 relative">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap relative group ${
                      isActive
                        ? "text-primary"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-settings-tab"
                        className="absolute inset-0 bg-primary/10 rounded-xl"
                        initial={false}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-3">
                      <span className={`${isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(124,110,240,0.5)]" : "opacity-70 group-hover:opacity-100 group-hover:scale-110"} transition-all duration-300`}>
                        {tab.icon}
                      </span>
                      {tab.label}
                    </div>
                    {/* Animated Underline for mobile view */}
                    {isActive && (
                      <motion.div
                        layoutId="active-settings-tab-line-mobile"
                        className="md:hidden absolute bottom-0 left-4 right-4 h-[2px] bg-primary rounded-t-full"
                        initial={false}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    {/* Animated side line for desktop view */}
                    {isActive && (
                      <motion.div
                        layoutId="active-settings-tab-line-desktop"
                        className="hidden md:block absolute top-2 bottom-2 left-0 w-[3px] bg-primary rounded-r-full"
                        initial={false}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0 premium-card p-6 md:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-10"
              >
                {/* TAB 1: PROFILE */}
                {activeTab === "profile" && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-text font-display">
                      Profile Details
                    </h2>

                    <div className="flex items-center gap-6">
                      <div className="relative">
                        <div
                          className="w-20 h-20 rounded-full bg-surface border-2 border-primary overflow-hidden flex items-center justify-center relative group cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {userProfile?.avatarUrl ? (
                            <img
                              src={userProfile.avatarUrl}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-8 h-8 text-muted" />
                          )}
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <UploadCloud className="w-6 h-6 text-white" />
                          </div>
                          {uploadingAvatar && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary animate-pulse"></div>
                          )}
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text">
                          Profile Picture
                        </h3>
                        <p className="text-xs text-muted mt-1">
                          Click to upload a new avatar. JPG, PNG or GIF.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Email (Read Only)
                        </label>
                        <input
                          type="text"
                          value={userProfile?.email || ""}
                          readOnly
                          className="w-full bg-background/50 border border-surface rounded-xl px-4 py-2.5 text-muted focus:outline-none text-sm cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Role
                        </label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          <option value="Student">Student</option>
                          <option value="Professional">Professional</option>
                          <option value="Entrepreneur">Entrepreneur</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        onClick={saveProfileInfo}
                        className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-hover transition"
                      >
                        Save Profile
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: PREFERENCES */}
                {activeTab === "preferences" && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-text font-display">
                      Workflow Preferences
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Work Hours Start
                        </label>
                        <select
                          value={prefs.workStartHour}
                          onChange={(e) =>
                            setPrefs({
                              ...prefs,
                              workStartHour: parseInt(e.target.value),
                            })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          {[6, 7, 8, 9, 10, 11, 12].map((h) => (
                            <option key={h} value={h}>
                              {h}:00 AM
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Work Hours End
                        </label>
                        <select
                          value={prefs.workEndHour}
                          onChange={(e) =>
                            setPrefs({
                              ...prefs,
                              workEndHour: parseInt(e.target.value),
                            })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          {[14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map(
                            (h) => (
                              <option key={h} value={h}>
                                {h > 24 ? h - 24 : h > 12 ? h - 12 : h}:00{" "}
                                {h >= 12 && h < 24 ? "PM" : "AM"}
                              </option>
                            ),
                          )}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Timezone
                        </label>
                        <select
                          value={prefs.timezone}
                          onChange={(e) =>
                            setPrefs({ ...prefs, timezone: e.target.value })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          <option
                            value={
                              Intl.DateTimeFormat().resolvedOptions().timeZone
                            }
                          >
                            Auto (
                            {Intl.DateTimeFormat().resolvedOptions().timeZone})
                          </option>
                          <option value="America/New_York">
                            America/New_York
                          </option>
                          <option value="America/Los_Angeles">
                            America/Los_Angeles
                          </option>
                          <option value="Europe/London">Europe/London</option>
                          <option value="Asia/Tokyo">Asia/Tokyo</option>
                          <option value="Asia/Kolkata">Asia/Kolkata</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                          Default Task Priority
                        </label>
                        <select
                          value={prefs.defaultPriority}
                          onChange={(e) =>
                            setPrefs({
                              ...prefs,
                              defaultPriority: e.target.value as "High" | "Medium" | "Low",
                            })
                          }
                          className="bg-background border border-white/5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-text focus:outline-none focus:border-primary/50 focus:bg-surface w-full capitalize transition-all shadow-inner"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                          Default Focus Mode
                        </label>
                        <select
                          value={prefs.defaultFocusSession}
                          onChange={(e) =>
                            setPrefs({
                              ...prefs,
                              defaultFocusSession: e.target.value as "Pomodoro" | "Deep Work" | "Custom",
                            })
                          }
                          className="bg-background border border-white/5 rounded-xl px-4 py-2.5 text-[13px] font-medium text-text focus:outline-none focus:border-primary/50 focus:bg-surface w-full transition-all shadow-inner"
                        >
                          <option value="Pomodoro">Pomodoro (25m / 5m)</option>
                          <option value="Deep Work">
                            Deep Work (90m / 15m)
                          </option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: NOTIFICATIONS */}
                {activeTab === "notifications" && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-text font-display">
                      Notifications & Alerts
                    </h2>

                    <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl flex items-center justify-between shadow-inner">
                      <div>
                        <h3 className="font-semibold text-[15px] text-text font-display">
                          Browser Notifications
                        </h3>
                        <p className="text-[13px] text-muted mt-1">
                          Receive alerts even when the app is closed.
                        </p>
                      </div>
                      <button
                        onClick={handleBrowserNotifsToggle}
                        className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner relative ${notifs.browserEnabled ? "bg-primary border-primary" : "bg-surface/50 border border-white/5 hover:border-white/10"}`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${notifs.browserEnabled ? "translate-x-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "translate-x-0"}`}
                        />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface/30 border border-transparent hover:border-white/5 transition-all group">
                        <div>
                          <h4 className="text-[14px] font-semibold text-text font-display">
                            Deadline Reminders (24h)
                          </h4>
                          <p className="text-[12px] text-muted mt-1">
                            Get warned a day before a task is due.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setNotifs({
                              ...notifs,
                              deadline24h: !notifs.deadline24h,
                            })
                          }
                          className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner relative ${notifs.deadline24h ? "bg-primary border-primary" : "bg-surface/50 border border-white/5 group-hover:border-white/10"}`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${notifs.deadline24h ? "translate-x-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface/30 border border-transparent hover:border-white/5 transition-all group">
                        <div>
                          <h4 className="text-[14px] font-semibold text-text font-display">
                            Urgent Deadline (1h)
                          </h4>
                          <p className="text-[12px] text-muted mt-1">
                            Get a final alert 1 hour before a task is due.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setNotifs({
                              ...notifs,
                              deadline1h: !notifs.deadline1h,
                            })
                          }
                          className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner relative ${notifs.deadline1h ? "bg-primary border-primary" : "bg-surface/50 border border-white/5 group-hover:border-white/10"}`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${notifs.deadline1h ? "translate-x-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface/30 border border-transparent hover:border-white/5 transition-all group">
                        <div>
                          <h4 className="text-[14px] font-semibold text-text font-display">
                            Daily Briefing
                          </h4>
                          <p className="text-[12px] text-muted mt-1 flex items-center gap-2">
                            A summary of your day at{" "}
                            <input
                              type="time"
                              value={notifs.morningBriefingTime}
                              onChange={(e) =>
                                setNotifs({
                                  ...notifs,
                                  morningBriefingTime: e.target.value,
                                })
                              }
                              className="bg-background border border-white/5 rounded-lg px-2 py-1 focus:outline-none focus:border-primary/50 text-text font-mono shadow-inner"
                            />
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface/30 border border-transparent hover:border-white/5 transition-all group">
                        <div>
                          <h4 className="text-[14px] font-semibold text-text font-display">
                            Streak Reminders
                          </h4>
                          <p className="text-[12px] text-muted mt-1">
                            Warn me in the evening if I haven't done any tasks.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setNotifs({
                              ...notifs,
                              streakReminders: !notifs.streakReminders,
                            })
                          }
                          className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner relative ${notifs.streakReminders ? "bg-primary border-primary" : "bg-surface/50 border border-white/5 group-hover:border-white/10"}`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${notifs.streakReminders ? "translate-x-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-surface/30 border border-transparent hover:border-white/5 transition-all group">
                        <div>
                          <h4 className="text-[14px] font-semibold text-text font-display">
                            Achievement Alerts
                          </h4>
                          <p className="text-[12px] text-muted mt-1">
                            Celebrate when unlocking new milestones.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setNotifs({
                              ...notifs,
                              achievementAlerts: !notifs.achievementAlerts,
                            })
                          }
                          className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1 shadow-inner relative ${notifs.achievementAlerts ? "bg-primary border-primary" : "bg-surface/50 border border-white/5 group-hover:border-white/10"}`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${notifs.achievementAlerts ? "translate-x-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: AI ASSISTANT */}
                {activeTab === "ai" && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-text font-display">
                      Flow AI Customization
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Personality Tone
                        </label>
                        <select
                          value={aiSettings.personality}
                          onChange={(e) =>
                            setAiSettings({
                              ...aiSettings,
                              personality: e.target.value as "Motivational" | "Direct" | "Gentle",
                            })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          <option value="Motivational">
                            Motivational (Encouraging, Enthusiastic)
                          </option>
                          <option value="Direct">
                            Direct (Brief, Action-oriented)
                          </option>
                          <option value="Gentle">
                            Gentle (Calm, Mindfulness-focused)
                          </option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Response Length
                        </label>
                        <select
                          value={aiSettings.responseLength}
                          onChange={(e) =>
                            setAiSettings({
                              ...aiSettings,
                              responseLength: e.target.value as "Brief" | "Balanced" | "Detailed",
                            })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          <option value="Brief">Brief</option>
                          <option value="Balanced">Balanced</option>
                          <option value="Detailed">Detailed</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                          Language
                        </label>
                        <select
                          value={aiSettings.language}
                          onChange={(e) =>
                            setAiSettings({
                              ...aiSettings,
                              language: e.target.value as "English" | "Hindi" | "Mixed",
                            })
                          }
                          className="w-full bg-background border border-surface rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary text-sm"
                        >
                          <option value="English">English</option>
                          <option value="Hindi">Hindi</option>
                          <option value="Mixed">Mixed (Hinglish)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-surface">
                      <h3 className="font-semibold text-text mb-4">
                        Test Flow's Personality
                      </h3>
                      <button
                        onClick={testFlow}
                        disabled={testingFlow}
                        className="px-4 py-2 bg-surface hover:bg-background border border-surface rounded-xl text-sm font-medium transition text-text disabled:opacity-50"
                      >
                        {testingFlow
                          ? "Generating..."
                          : 'Ask Flow to "Say hello in 10 words"'}
                      </button>

                      {flowResponse && (
                        <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                          <p className="text-sm italic text-primary">
                            "{flowResponse}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 5: DATA */}
                {activeTab === "data" && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-xl font-bold text-text font-display mb-4">
                        Data Export
                      </h2>
                      <div className="flex flex-wrap gap-4">
                        <button
                          onClick={exportTasksJSON}
                          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-background border border-surface rounded-xl text-sm font-medium transition text-text"
                        >
                          <Download className="w-4 h-4" /> Export Tasks (JSON)
                        </button>
                        <button
                          onClick={exportTasksCSV}
                          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-background border border-surface rounded-xl text-sm font-medium transition text-text"
                        >
                          <Download className="w-4 h-4" /> Export Tasks (CSV)
                        </button>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-surface">
                      <h2 className="text-xl font-bold text-rose-500 font-display mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> Danger Zone
                      </h2>

                      <div className="space-y-4">
                        <div className="p-4 border border-rose-500/20 rounded-xl bg-rose-500/5 flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-text">
                              Clear Completed Tasks
                            </h3>
                            <p className="text-xs text-muted mt-1">
                              Permanently delete all tasks marked as done.
                            </p>
                          </div>
                          <button
                            onClick={() => setClearTasksOpen(true)}
                            className="px-4 py-2 bg-surface hover:bg-rose-500/10 text-rose-500 rounded-xl text-sm font-semibold transition"
                          >
                            Clear Tasks
                          </button>
                        </div>

                        <div className="p-4 border border-rose-500/20 rounded-xl bg-rose-500/5 flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-text">
                              Delete Account
                            </h3>
                            <p className="text-xs text-muted mt-1">
                              Permanently delete your account and all data.
                            </p>
                          </div>
                          <button
                            onClick={() => setDeleteConfirmationOpen(true)}
                            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-semibold transition shadow-md shadow-rose-500/20"
                          >
                            Delete Account
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Dev Only: Seed Demo Data */}
      {import.meta.env.DEV && (
        <div className="mt-8 flex justify-center pb-12">
          <button 
            onClick={async () => {
              const { seedDemoData } = await import('../lib/seedDemoData');
              if (currentUser) {
                await seedDemoData(currentUser.uid);
              }
            }}
            className="px-4 py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-xs font-mono transition-colors"
          >
            🧪 Seed Demo Data — Dev Only
          </button>
        </div>
      )}

      {/* Clear Tasks Modal */}
      <AnimatePresence>
        {clearTasksOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-card border border-surface p-6 rounded-2xl shadow-2xl"
            >
              <h3 className="text-lg font-bold text-text mb-2">
                Clear completed tasks?
              </h3>
              <p className="text-sm text-muted mb-6">
                This action cannot be undone. All tasks marked as 'done' will be
                permanently deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setClearTasksOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-background border border-surface text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={clearCompletedTasks}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition"
                >
                  Yes, Clear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Modal */}
      <AnimatePresence>
        {deleteConfirmationOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-card border border-rose-500/30 p-6 rounded-2xl shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <h3 className="text-lg font-bold text-text mb-2">
                Delete Account?
              </h3>
              <p className="text-sm text-muted mb-6">
                Are you absolutely sure? This will delete all your tasks,
                habits, analytics, and your user profile permanently.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmationOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-background border border-surface text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAccount}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition"
                >
                  Permanently Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
