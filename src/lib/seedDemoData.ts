import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";
import { format, subDays, addDays } from "date-fns";

export async function seedDemoData(userId: string) {
  try {
    const now = new Date();

    // 1. Create Tasks
    const tasksData = [
      {
        title: "Submit DBMS assignment",
        description: "Complete the ER diagram and normalization steps",
        category: "study",
        priority: "high",
        dueDate: format(subDays(now, 1), "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Pay electricity bill",
        category: "finance",
        priority: "critical",
        dueDate: format(subDays(now, 2), "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Prepare slides for Finqy interview",
        category: "work",
        priority: "high",
        dueDate: format(now, "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Review pull request",
        category: "work",
        priority: "medium",
        dueDate: format(now, "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Study for Data Structures exam",
        category: "study",
        priority: "high",
        dueDate: format(addDays(now, 2), "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Complete React component library",
        category: "work",
        priority: "medium",
        dueDate: format(addDays(now, 4), "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Team standup prep",
        category: "work",
        priority: "low",
        dueDate: format(addDays(now, 1), "yyyy-MM-dd"),
        status: "todo",
        userId,
      },
      {
        title: "Submit hackathon proposal",
        category: "personal",
        priority: "medium",
        dueDate: format(subDays(now, 3), "yyyy-MM-dd"),
        status: "done",
        completedAt: serverTimestamp(),
        userId,
      },
      {
        title: "Update resume",
        category: "personal",
        priority: "high",
        dueDate: format(subDays(now, 4), "yyyy-MM-dd"),
        status: "done",
        completedAt: serverTimestamp(),
        userId,
      },
      {
        title: "Plan weekend trip",
        category: "personal",
        priority: "low",
        dueDate: format(now, "yyyy-MM-dd"),
        status: "todo",
        isAIGenerated: true,
        subtasks: [
          { id: "1", title: "Book hotel", completed: true },
          { id: "2", title: "Rent car", completed: true },
          { id: "3", title: "Create itinerary", completed: false },
          { id: "4", title: "Pack bags", completed: false },
        ],
        userId,
      },
    ];

    for (const task of tasksData) {
      await addDoc(collection(db, "tasks"), {
        ...task,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deleted: false,
      });
    }

    // 2. Create Habits
    const generateHabitCompletions = (
      daysCompleted: number[],
      currentStreak: number,
    ) => {
      const completions: Record<string, any> = {};
      daysCompleted.forEach((dayOffset) => {
        completions[format(subDays(now, dayOffset), "yyyy-MM-dd")] = {
          completedAt: serverTimestamp(),
        };
      });
      return { completions, streak: currentStreak };
    };

    const habitsData = [
      {
        name: "Morning workout",
        color: "#F87171",
        ...generateHabitCompletions([0, 1, 2, 4, 6], 3),
        userId,
      },
      {
        name: "Read 20 minutes",
        color: "#7C6EF0",
        ...generateHabitCompletions([1, 2, 5, 6], 0),
        userId,
      },
      {
        name: "No phone before bed",
        color: "#38BDF8",
        ...generateHabitCompletions([0, 1, 2, 3, 4, 5], 6),
        userId,
      },
    ];

    for (const habit of habitsData) {
      await addDoc(collection(db, "habits"), {
        ...habit,
        createdAt: serverTimestamp(),
      });
    }

    // 3. Create Focus Sessions for analytics
    const focusSessions = [];
    for (let i = 0; i < 14; i++) {
      const dayDate = subDays(now, i);
      // Randomly generate 0-2 sessions per day
      const sessionCount = Math.floor(Math.random() * 3);
      for (let j = 0; j < sessionCount; j++) {
        focusSessions.push({
          userId,
          startTime: serverTimestamp(), // Not strictly accurate chronologically but fine for metrics
          durationMinutes: [15, 25, 45, 60][Math.floor(Math.random() * 4)],
          date: format(dayDate, "yyyy-MM-dd"),
          taskId: null,
        });
      }
    }

    for (const session of focusSessions) {
      await addDoc(collection(db, "focus_sessions"), session);
    }

    // 4. Create Chat Session
    await addDoc(collection(db, "chat_sessions"), {
      userId,
      title: "Interview Preparation",
      messages: [
        {
          id: "1",
          role: "user",
          text: "I have an interview with Finqy next week. How should I prepare?",
          timestamp: serverTimestamp(),
        },
        {
          id: "2",
          role: "model",
          text: "Great news! Finqy typically focuses on React, system design, and product thinking. I suggest we break this down into a 5-day study plan. Should I generate some tasks for your calendar?",
          timestamp: serverTimestamp(),
        },
        {
          id: "3",
          role: "user",
          text: "Yes please, that would be very helpful.",
          timestamp: serverTimestamp(),
        },
        {
          id: "4",
          role: "model",
          text: 'I have added 3 tasks to your schedule: "Review React Hooks", "Practice System Design", and "Mock Interview Prep". Good luck!',
          timestamp: serverTimestamp(),
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 5. Update User Stats
    await updateDoc(doc(db, "users", userId), {
      "stats.tasksCompleted": 12,
      "stats.streakDays": 6,
      "stats.totalFocusMinutes": 340,
      "stats.aiTasksCreated": 3,
    });

    toast.success("Demo data seeded! Refresh to see it.");
    console.log("Demo data successfully seeded.");
  } catch (error) {
    console.error("Error seeding demo data:", error);
    toast.error("Failed to seed demo data.");
  }
}
