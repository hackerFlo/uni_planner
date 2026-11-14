// Runs before first paint (a blocking classic script, allowed by script-src
// 'self'). Shapes the pre-JS skeleton in index.html like the page it stands in
// for, from hints the app saved last time (src/utils/paintHints.js):
//   - the theme, so the screen does not flash the OS scheme first;
//   - whether the navbar shows the next-exam pill;
//   - the week board's scroll, as WeeklyPlanner will restore it.
// The board numbers mirror the skeleton markup: 288px sidebar from 768px up,
// 20px padding, 180px minimum columns, 12px gaps.
(function () {
  var root = document.documentElement;

  function read(store, key) {
    try {
      return window[store].getItem(key);
    } catch {
      // Blocked storage: every hint falls back to its default below.
      return null;
    }
  }

  var theme = read('localStorage', 'uniPlanner.themeHint');
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  if (read('localStorage', 'uniPlanner.examHint') === '1') root.classList.add('pk-exam');

  var width = window.innerWidth;
  var desktop = width >= 768;
  var client = width - 40 - (desktop ? 288 : 0);
  var column = desktop ? Math.max(180, (client - 72) / 7) : 180;
  var maxScroll = Math.max(0, 7 * column + 72 - client);
  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var target = ((now.getDay() + 6) % 7) * (column + 12);
  var saved = null;
  try {
    saved = JSON.parse(read('sessionStorage', 'uniPlanner.boardScroll'));
  } catch {
    saved = null;
  }
  if (saved && saved.today === today && isFinite(saved.scrollLeft)) {
    if (saved.weekOffset === 0) target = saved.scrollLeft;
    else if (saved.weekOffset === 1) target = 0;
    else if (saved.weekOffset === -1) target = maxScroll;
  }
  root.style.setProperty('--pk-scroll', -Math.max(0, Math.min(maxScroll, target)) + 'px');
})();
