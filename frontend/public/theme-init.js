// Apply before the stylesheet loads to avoid a light flash on dark-mode visits.
(() => {
  let preference;
  try {
    preference = localStorage.getItem("portfolio-theme");
  } catch {
    // Theme selection still works when browser storage is unavailable.
  }
  const theme = preference === "light" || preference === "dark"
    ? preference
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#141d19" : "#f7f8f4");
})();
