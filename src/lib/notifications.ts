import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { db } from "../firebase";

export async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted" && "serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/sw.js");
      return true;
    }
  } catch (err) {
    console.error("Failed to request notification permission:", err);
  }

  return false;
}

export function scheduleDeadlineNotifications(tasks: any[]) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;

  const now = new Date().getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  const oneHour = 60 * 60 * 1000;

  tasks.forEach((task) => {
    if (task.status === "done" || !task.dueDate) return;

    let dueTime =
      task.dueDate instanceof Date
        ? task.dueDate.getTime()
        : task.dueDate.seconds
          ? task.dueDate.seconds * 1000
          : new Date(task.dueDate).getTime();

    if (isNaN(dueTime)) return;

    const timeUntilDue = dueTime - now;

    if (
      timeUntilDue > twentyFourHours &&
      timeUntilDue < twentyFourHours + 5000
    ) {
      setTimeout(() => {
        new Notification(`⚡ Due tomorrow: ${task.title}`, {
          body: "You have 24 hours left.",
          icon: "/vite.svg",
        });
      }, timeUntilDue - twentyFourHours);
    } else if (
      timeUntilDue > 0 &&
      timeUntilDue < twentyFourHours &&
      timeUntilDue > twentyFourHours - 60000
    ) {
      // Just crossed
      new Notification(`⚡ Due tomorrow: ${task.title}`, {
        body: "You have 24 hours left.",
        icon: "/vite.svg",
      });
    }

    if (timeUntilDue > oneHour && timeUntilDue < oneHour + 5000) {
      setTimeout(() => {
        new Notification(`🚨 Due in 1 hour: ${task.title}`, {
          body: "Take action now!",
          icon: "/vite.svg",
        });
      }, timeUntilDue - oneHour);
    } else if (
      timeUntilDue > 0 &&
      timeUntilDue < oneHour &&
      timeUntilDue > oneHour - 60000
    ) {
      new Notification(`🚨 Due in 1 hour: ${task.title}`, {
        body: "Take action now!",
        icon: "/vite.svg",
      });
    }
  });
}

export function checkOverdueTasks(tasks: any[]) {
  const now = new Date().getTime();
  return tasks.filter((task) => {
    if (task.status === "done" || !task.dueDate) return false;
    let dueTime =
      task.dueDate instanceof Date
        ? task.dueDate.getTime()
        : task.dueDate.seconds
          ? task.dueDate.seconds * 1000
          : new Date(task.dueDate).getTime();

    if (isNaN(dueTime)) return false;
    return dueTime < now;
  });
}

export async function generateSystemNotifications(
  tasks: any[],
  currentUser: any,
  doneTasksToday: number,
) {
  if (!currentUser || currentUser.uid.startsWith("local_user_")) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const notifsRef = collection(db, `notifications/${currentUser.uid}/items`);

  const createIfNotExists = async (
    type: string,
    title: string,
    message: string,
    customId: string,
    url = "/tasks",
  ) => {
    const q = query(notifsRef, where("dedupeId", "==", customId));
    const snap = await getDocs(q);
    if (snap.empty) {
      await addDoc(notifsRef, {
        type,
        title,
        message,
        read: false,
        createdAt: serverTimestamp(),
        dedupeId: customId,
        url,
      });
    }
  };

  const overdue = checkOverdueTasks(tasks);
  for (const task of overdue) {
    let dueTime =
      task.dueDate instanceof Date
        ? task.dueDate
        : task.dueDate.seconds
          ? new Date(task.dueDate.seconds * 1000)
          : new Date(task.dueDate);

    await createIfNotExists(
      "deadline",
      "🚨 Overdue Task",
      `"${task.title}" was due ${formatDistanceToNow(dueTime)} ago`,
      `overdue_${task.id}_${todayStr}`,
    );
  }

  for (const task of tasks) {
    if (task.status === "done" || !task.dueDate) continue;
    let dueTime =
      task.dueDate instanceof Date
        ? task.dueDate
        : task.dueDate.seconds
          ? new Date(task.dueDate.seconds * 1000)
          : new Date(task.dueDate);

    if (isNaN(dueTime.getTime())) continue;

    if (isToday(dueTime)) {
      await createIfNotExists(
        "deadline",
        "⚡ Due Today",
        `"${task.title}" is due today`,
        `duetoday_${task.id}_${todayStr}`,
      );
    } else if (isTomorrow(dueTime)) {
      await createIfNotExists(
        "reminder",
        "📅 Due Tomorrow",
        `Don't forget: "${task.title}"`,
        `duetomorrow_${task.id}_${todayStr}`,
      );
    }
  }

  const hour = new Date().getHours();
  if (hour >= 18 && doneTasksToday === 0) {
    await createIfNotExists(
      "reminder",
      "🔥 Keep Your Streak!",
      "You haven't completed any tasks today. Your streak is at risk!",
      `streak_reminder_${todayStr}`,
      "/dashboard",
    );
  }
}
