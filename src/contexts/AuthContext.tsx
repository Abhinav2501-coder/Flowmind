import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: any;
  avatarUrl: string;
  preferences: {
    workStartHour: number;
    workEndHour: number;
    timezone: string;
    defaultPriority?: "Low" | "Medium" | "High";
    defaultFocusSession?: "Pomodoro" | "Deep Work" | "Custom";
    theme?: "light" | "dark";
  };
  notificationSettings?: {
    browserEnabled: boolean;
    deadline24h: boolean;
    deadline1h: boolean;
    morningBriefingTime: string;
    streakReminders: boolean;
    achievementAlerts: boolean;
  };
  aiSettings?: {
    personality: "Motivational" | "Direct" | "Gentle";
    responseLength: "Brief" | "Balanced" | "Detailed";
    language: "English" | "Hindi" | "Mixed";
  };
  stats: {
    tasksCompleted: number;
    streakDays: number;
    totalFocusMinutes: number;
  };
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (
    email: string,
    pass: string,
    name: string,
    role: string,
  ) => Promise<void>;
  googleSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileStats: (minutes: number, tasksDelta?: number) => Promise<void>;
  updateProfileField: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchUserProfile(uid: string) {
    try {
      if (uid.startsWith("local_user_")) {
        const profileStr = localStorage.getItem(`profile_${uid}`);
        if (profileStr) {
          setUserProfile(JSON.parse(profileStr));
          return;
        }
      }
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      } else {
        const profileStr = localStorage.getItem(`profile_${uid}`);
        if (profileStr) {
          setUserProfile(JSON.parse(profileStr));
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      const profileStr = localStorage.getItem(`profile_${uid}`);
      if (profileStr) {
        setUserProfile(JSON.parse(profileStr));
      }
    }
  }

  async function login(email: string, pass: string) {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (authErr: any) {
      console.warn(
        "Firebase Auth login failed, checking local credentials:",
        authErr,
      );
      const localCredsStr = localStorage.getItem(`local_user_${email}`);
      if (localCredsStr) {
        const localCreds = JSON.parse(localCredsStr);
        if (localCreds.pass === pass) {
          const profileStr = localStorage.getItem(`profile_${localCreds.uid}`);
          const profile = profileStr ? JSON.parse(profileStr) : null;

          const mockUser = {
            uid: localCreds.uid,
            email,
            displayName: profile?.displayName || "User",
          } as any;
          setCurrentUser(mockUser);
          setUserProfile(profile);
          localStorage.setItem(
            "local_session",
            JSON.stringify({
              uid: localCreds.uid,
              email,
              name: profile?.displayName || "User",
            }),
          );
          return;
        } else {
          throw new Error("Incorrect password for local account");
        }
      }

      // If no local account exists, auto-create one for testing ease!
      console.warn("Auto-creating local account on login try");
      const uid = "local_user_" + Math.random().toString(36).substring(2, 11);
      const newProfile = {
        uid,
        email,
        displayName: email.split("@")[0],
        role: "Professional",
        createdAt: new Date().toISOString(),
        avatarUrl: "",
        preferences: {
          workStartHour: 9,
          workEndHour: 18,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        stats: {
          tasksCompleted: 0,
          streakDays: 0,
          totalFocusMinutes: 0,
        },
      };
      localStorage.setItem(
        `local_user_${email}`,
        JSON.stringify({ email, pass, uid }),
      );
      localStorage.setItem(`profile_${uid}`, JSON.stringify(newProfile));

      const mockUser = {
        uid,
        email,
        displayName: newProfile.displayName,
      } as any;
      setCurrentUser(mockUser);
      setUserProfile(newProfile as UserProfile);
      localStorage.setItem(
        "local_session",
        JSON.stringify({ uid, email, name: newProfile.displayName }),
      );
    }
  }

  async function signup(
    email: string,
    pass: string,
    name: string,
    role: string,
  ) {
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(user, { displayName: name });

      const newProfile = {
        uid: user.uid,
        email,
        displayName: name,
        role,
        createdAt: serverTimestamp(),
        avatarUrl: "",
        preferences: {
          workStartHour: 9,
          workEndHour: 18,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        stats: {
          tasksCompleted: 0,
          streakDays: 0,
          totalFocusMinutes: 0,
        },
      };

      try {
        await setDoc(doc(db, "users", user.uid), newProfile);
      } catch (fsErr) {
        console.warn("Firestore save failed on signup, saving locally:", fsErr);
        localStorage.setItem(`profile_${user.uid}`, JSON.stringify(newProfile));
      }
      setCurrentUser(user);
      setUserProfile(newProfile as UserProfile);
    } catch (authErr: any) {
      console.warn(
        "Firebase signup failed, creating local fallback account:",
        authErr,
      );
      const uid = "local_user_" + Math.random().toString(36).substring(2, 11);
      const newProfile = {
        uid,
        email,
        displayName: name,
        role,
        createdAt: new Date().toISOString(),
        avatarUrl: "",
        preferences: {
          workStartHour: 9,
          workEndHour: 18,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        stats: {
          tasksCompleted: 0,
          streakDays: 0,
          totalFocusMinutes: 0,
        },
      };

      localStorage.setItem(
        `local_user_${email}`,
        JSON.stringify({ email, pass, uid }),
      );
      localStorage.setItem(`profile_${uid}`, JSON.stringify(newProfile));

      const mockUser = { uid, email, displayName: name } as any;
      setCurrentUser(mockUser);
      setUserProfile(newProfile as UserProfile);
      localStorage.setItem(
        "local_session",
        JSON.stringify({ uid, email, name }),
      );
    }
  }

  async function googleSignIn() {
    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const newProfile = {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "User",
          role: "Google User",
          createdAt: serverTimestamp(),
          avatarUrl: user.photoURL || "",
          preferences: {
            workStartHour: 9,
            workEndHour: 18,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          stats: {
            tasksCompleted: 0,
            streakDays: 0,
            totalFocusMinutes: 0,
          },
        };
        try {
          await setDoc(docRef, newProfile);
        } catch (fsErr) {
          console.warn("Firestore google save failed:", fsErr);
          localStorage.setItem(
            `profile_${user.uid}`,
            JSON.stringify(newProfile),
          );
        }
        setUserProfile(newProfile as UserProfile);
      } else {
        setUserProfile(docSnap.data() as UserProfile);
      }
    } catch (err: any) {
      console.error("Google sign in error, using fallback guest session:", err);
      // Fallback guest session
      const uid = "local_user_google_guest";
      const newProfile = {
        uid,
        email: "google_guest@example.com",
        displayName: "Google Guest",
        role: "Google User",
        createdAt: new Date().toISOString(),
        avatarUrl: "",
        preferences: {
          workStartHour: 9,
          workEndHour: 18,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        stats: {
          tasksCompleted: 0,
          streakDays: 0,
          totalFocusMinutes: 0,
        },
      };
      localStorage.setItem(`profile_${uid}`, JSON.stringify(newProfile));
      const mockUser = {
        uid,
        email: newProfile.email,
        displayName: newProfile.displayName,
      } as any;
      setCurrentUser(mockUser);
      setUserProfile(newProfile as UserProfile);
      localStorage.setItem(
        "local_session",
        JSON.stringify({
          uid,
          email: newProfile.email,
          name: newProfile.displayName,
        }),
      );
    }
  }

  async function updateProfileStats(minutes: number, tasksDelta = 0) {
    if (!currentUser || !userProfile) return;
    const currentStats = userProfile.stats || {
      tasksCompleted: 0,
      streakDays: 0,
      totalFocusMinutes: 0,
    };
    const newStats = {
      ...currentStats,
      totalFocusMinutes: (currentStats.totalFocusMinutes || 0) + minutes,
      tasksCompleted: (currentStats.tasksCompleted || 0) + tasksDelta,
    };
    const updatedProfile = {
      ...userProfile,
      stats: newStats,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem(
      `profile_${currentUser.uid}`,
      JSON.stringify(updatedProfile),
    );
    try {
      if (!currentUser.uid.startsWith("local_user_")) {
        await updateDoc(doc(db, "users", currentUser.uid), {
          stats: newStats,
        });
      }
    } catch (err) {
      console.warn("Could not update profile stats in firestore:", err);
    }
  }

  async function updateProfileField(updates: Partial<UserProfile>) {
    if (!currentUser || !userProfile) return;
    const updatedProfile = { ...userProfile, ...updates };
    setUserProfile(updatedProfile);
    localStorage.setItem(
      `profile_${currentUser.uid}`,
      JSON.stringify(updatedProfile),
    );
    try {
      if (!currentUser.uid.startsWith("local_user_")) {
        await updateDoc(doc(db, "users", currentUser.uid), updates);
      }
    } catch (err) {
      console.warn("Could not update profile fields in firestore:", err);
    }
  }

  function logout() {
    localStorage.removeItem("local_session");
    setCurrentUser(null);
    setUserProfile(null);
    return signOut(auth).catch(() => {});
  }

  useEffect(() => {
    const localSessionStr = localStorage.getItem("local_session");
    if (localSessionStr) {
      try {
        const localSession = JSON.parse(localSessionStr);
        const mockUser = {
          uid: localSession.uid,
          email: localSession.email,
          displayName: localSession.name,
        } as any;
        setCurrentUser(mockUser);

        const profileStr = localStorage.getItem(`profile_${localSession.uid}`);
        if (profileStr) {
          setUserProfile(JSON.parse(profileStr));
        } else {
          setUserProfile({
            uid: localSession.uid,
            email: localSession.email,
            displayName: localSession.name,
            role: "Professional",
            createdAt: new Date().toISOString(),
            avatarUrl: "",
            preferences: {
              workStartHour: 9,
              workEndHour: 18,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            stats: {
              tasksCompleted: 0,
              streakDays: 0,
              totalFocusMinutes: 0,
            },
          } as UserProfile);
        }
        setLoading(false);
        return;
      } catch (err) {
        console.error("Error restoring local session:", err);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    signup,
    googleSignIn,
    logout,
    updateProfileStats,
    updateProfileField,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
