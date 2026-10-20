// Applies the saved theme before first paint. Loaded as a same-origin script so the
// Content-Security-Policy does not need to allow inline scripts for it.
try {
  var t = localStorage.getItem("ghadi-theme");
  var dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch {
  // Storage can be unavailable; fall back to the stylesheet default.
}
