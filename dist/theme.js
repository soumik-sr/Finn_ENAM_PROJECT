const deviceTheme = matchMedia('(prefers-color-scheme: dark)');
let chosenTheme;
try { chosenTheme = localStorage.getItem('finn.theme'); } catch {}
function applyTheme() {
  const dark = chosenTheme ? chosenTheme === 'dark' : deviceTheme.matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const button = document.getElementById('theme-toggle');
  if (button) {
    button.setAttribute('aria-pressed', String(dark));
    button.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
    button.setAttribute('aria-label', 'Dark mode');
  }
}
applyTheme();
deviceTheme.addEventListener('change', applyTheme);
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  document.getElementById('theme-toggle').onclick = () => {
    chosenTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('finn.theme', chosenTheme); } catch {}
    applyTheme();
  };
});
