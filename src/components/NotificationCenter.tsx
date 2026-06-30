import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  Bell,
  Check,
  Trash2,
  Zap,
  Target,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  type: "deadline" | "achievement" | "insight" | "reminder";
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
  url?: string;
}

export function NotificationCenter() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser || currentUser.uid.startsWith("local_user_")) return;

    const q = query(
      collection(db, `notifications/${currentUser.uid}/items`),
      orderBy("createdAt", "desc"),
      limit(20),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() } as Notification);
      });
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      if (!n.read) {
        batch.update(doc(db, `notifications/${currentUser.uid}/items`, n.id), {
          read: true,
        });
      }
    });
    await batch.commit();
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read && currentUser) {
      const batch = writeBatch(db);
      batch.update(
        doc(db, `notifications/${currentUser.uid}/items`, notif.id),
        { read: true },
      );
      await batch.commit();
    }
    setIsOpen(false);
    if (notif.url) {
      navigate(notif.url);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "deadline":
        return <Zap className="w-4 h-4 text-amber-500" />;
      case "achievement":
        return <Target className="w-4 h-4 text-emerald-500" />;
      case "insight":
        return <Lightbulb className="w-4 h-4 text-violet-400" />;
      case "reminder":
        return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
      default:
        return <Bell className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted hover:text-text transition-colors rounded-full hover:bg-surface focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center bg-rose-500 rounded-full border-2 border-background text-[8px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-card border border-surface rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[400px]"
            style={{ backdropFilter: "blur(12px)" }}
          >
            <div className="flex items-center justify-between p-3 border-b border-surface bg-background/50">
              <h3 className="font-bold text-sm text-text">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:text-primary-hover transition flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted text-sm">
                  You're all caught up! 🎉
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 border-b border-surface/50 last:border-0 cursor-pointer transition-colors ${
                      notif.read
                        ? "bg-transparent hover:bg-surface/50"
                        : "bg-primary/5 hover:bg-primary/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-1.5 rounded-full shrink-0 ${notif.read ? "bg-surface" : "bg-background"}`}
                      >
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p
                            className={`text-sm truncate ${notif.read ? "font-medium text-text" : "font-bold text-text"}`}
                          >
                            {notif.title}
                          </p>
                          {notif.createdAt && (
                            <span className="text-[10px] text-muted shrink-0">
                              {formatDistanceToNow(
                                notif.createdAt?.toDate
                                  ? notif.createdAt.toDate()
                                  : new Date(),
                                { addSuffix: true },
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted leading-snug">
                          {notif.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-surface bg-background/50 text-center">
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-muted hover:text-text transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
