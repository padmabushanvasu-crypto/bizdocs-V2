/**
 * Temporarily removes the .dark class from <html> for the duration of
 * window.print(), then restores it. This ensures printed output is always
 * light-mode regardless of the user's current theme.
 */
export function printWithLightMode(): void {
  const html = document.documentElement;
  const wasDark = html.classList.contains("dark");
  if (wasDark) html.classList.remove("dark");
  window.print();
  if (wasDark) html.classList.add("dark");
}
