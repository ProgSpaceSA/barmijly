"use client";
import { useEffect, useState } from "react";

function getStoredTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem("brm-theme") as "light" | "dark" | null;
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  } catch {
    return "dark";
  }
}

export function useTheme() {
  // Initialize from DOM class so React state matches what the blocking script already applied
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "dark"; // SSR default
  });

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored !== theme) {
      setTheme(stored);
      document.documentElement.classList.toggle("dark", stored === "dark");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("brm-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggle, isDark: theme === "dark" };
}
