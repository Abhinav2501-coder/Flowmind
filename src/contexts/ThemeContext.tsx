import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { userProfile, updateProfileField, currentUser } = useAuth();

  // Initialize from local storage or system preference
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
    return "dark";
  });

  // Sync with user profile if it's loaded and has a theme preference
  useEffect(() => {
    if (
      userProfile?.preferences?.theme &&
      (userProfile.preferences.theme === "light" ||
        userProfile.preferences.theme === "dark")
    ) {
      if (theme !== userProfile.preferences.theme) {
        setTheme(userProfile.preferences.theme);
      }
    }
  }, [userProfile?.preferences?.theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    if (currentUser) {
      // Save preference to Firestore (debounced or directly, we'll just do it directly since it's an explicit action)
      updateProfileField({
        preferences: {
          ...userProfile?.preferences,
          theme: newTheme,
        } as any,
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
