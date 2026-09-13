import { useEffect, useState } from "react";
import Icon from "./Icon";

const STORAGE_KEY = "portfolio-theme";
const isTheme = (value) => value === "light" || value === "dark";

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export default function ThemeToggle() {
  const [preference, setPreference] = useState(storedTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = preference ?? (systemDark ? "dark" : "light");
  const nextTheme = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (event) => setSystemDark(event.matches);
    const onStorageChange = (event) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setPreference(isTheme(event.newValue) ? event.newValue : null);
      }
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorageChange);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#141d19" : "#f7f8f4");
  }, [theme]);

  function toggle() {
    setPreference(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Keep the in-memory preference for this visit.
    }
  }

  return (
    <button type="button" className="icon-button theme-toggle" onClick={toggle}
      aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>
      <Icon name={nextTheme === "dark" ? "moon" : "sun"} />
    </button>
  );
}
