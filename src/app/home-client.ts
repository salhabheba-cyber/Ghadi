// @ts-nocheck — ported verbatim from the approved HTML artifact; DOM-only logic.
/* Mounts the interactive behaviour of the Ghadi home screen. Returns a cleanup function. */
export function mountHome(root: HTMLElement): () => void {
let __raf = 0, __iv = 0;
const $ = (id) => root.querySelector("#" + id);


/* ── Language ── */
const LANGS = {
  en: {
    attach_file: 'Attach File', paste_url: 'Paste URL',
    attach_photos: 'Attach Photos', prompt: 'Prompt',
    nav_home: 'HOME', nav_quizzes: 'MY QUIZZES', nav_profile: 'PROFILE', nav_rank: 'RANK',
    speech: ["Let's study! 📚","Ready to learn? ✨","Upload a file! 🎓","Quiz yourself! 🌸","You've got this! 💜"],
  },
  fr: {
    attach_file: 'Fichier', paste_url: 'Coller URL',
    attach_photos: 'Photos', prompt: 'Invite',
    nav_home: 'ACCUEIL', nav_quizzes: 'MES QUIZ', nav_profile: 'PROFIL', nav_rank: 'RANG',
    speech: ["Étudions ! 📚","Prête à apprendre ? ✨","Importe un fichier ! 🎓","Fais un quiz ! 🌸","Tu peux le faire ! 💜"],
  },
  ar: {
    attach_file: 'إرفاق ملف', paste_url: 'لصق رابط',
    attach_photos: 'إرفاق صور', prompt: 'نص توجيهي',
    nav_home: 'الرئيسية', nav_quizzes: 'اختباراتي', nav_profile: 'الملف', nav_rank: 'الترتيب',
    speech: ["هيا ندرس! 📚","مستعدة للتعلم؟ ✨","ارفع ملفاً! 🎓","اختبر نفسك! 🌸","أنت قادر! 💜"],
  },
};

let currentLang = 'en';
function setLang(lang) {
  currentLang = lang;
  const t = LANGS[lang];
  root.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  root.querySelectorAll('[data-key]').forEach(el => { const v = t[el.dataset.key]; if (v) el.textContent = v; });
  appEl.style.direction = lang === 'ar' ? 'rtl' : 'ltr';
  speechMessages = t.speech; msgIdx = 0; speechEl.textContent = speechMessages[0];
}
function cycleLang() {
  const order = ['en','fr','ar'];
  setLang(order[(order.indexOf(currentLang) + 1) % 3]);
}

/* ── Soft floating orbs ── */
const canvas = $('bubbles');
const ctx = canvas.getContext('2d');
const appEl = $('app');
let W, H;
function resize() { W = canvas.width = appEl.offsetWidth; H = canvas.height = appEl.offsetHeight; }
resize(); window.addEventListener('resize', resize);

// Mix of purple orbs and pastel daisy/blush orbs
const ORB_COLORS = [
  'rgba(196,181,253,0.18)', // lavender
  'rgba(249,168,212,0.14)', // blush
  'rgba(253,224,71,0.12)',  // daisy yellow
  'rgba(255,255,255,0.10)', // white
];
const orbs = Array.from({length: 22}, () => ({
  x: Math.random() * 430, y: 700 + Math.random() * 400,
  r: 4 + Math.random() * 22,
  sp: 0.22 + Math.random() * 0.6,
  wobble: Math.random() * Math.PI * 2,
  ws: 0.007 + Math.random() * 0.016,
  color: ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
}));

(function drawOrbs() {
  ctx.clearRect(0, 0, W, H);
  for (const b of orbs) {
    b.y -= b.sp; b.wobble += b.ws;
    if (b.y + b.r < 0) { b.y = H + b.r; b.x = Math.random() * W; }
    const cx = b.x + Math.sin(b.wobble) * 12;
    ctx.beginPath(); ctx.arc(cx, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.fill();
    ctx.strokeStyle = b.color.replace(/[\d.]+\)$/, '0.25)');
    ctx.lineWidth = 1; ctx.stroke();
  }
  __raf = requestAnimationFrame(drawOrbs);
})();

/* ── Counters ── */
let coins = 0, xp = 0;
const coinEl = $('coin-count');
const xpEl   = $('xp-count');
function animateCount(el, from, to) {
  const start = performance.now();
  (function tick(now) {
    const t = Math.min((now - start) / 650, 1);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}
function cardTap(card, reward) {
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + 20;
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('div');
    b.className = 'burst';
    const a = -Math.PI / 2 + (i - 2) * 0.38;
    b.style.cssText = `left:${cx + Math.cos(a)*30 - 11}px;top:${cy - 8}px;animation-delay:${i * 55}ms`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 900);
  }
  const oc = coins, ox = xp; coins += reward; xp += Math.ceil(reward * 0.6);
  animateCount(coinEl, oc, coins); animateCount(xpEl, ox, xp);
}

/* ── Mic ── */
let micActive = false;
const micBtn = $('mic-btn');
function micTap() {
  micActive = !micActive;
  micBtn.style.background = micActive ? '#EDE9FE' : 'rgba(255,255,255,0.97)';
  micBtn.style.transform  = micActive ? 'translateX(-50%) scale(1.12)' : 'translateX(-50%)';
  micBtn.style.boxShadow  = micActive ? '0 0 0 7px rgba(124,58,237,0.22), 0 6px 22px rgba(76,29,149,0.28)' : '';
}

/* ── Nav ── */
function navTap(item) {
  root.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    const s = n.querySelector('svg'); if (s) s.setAttribute('stroke', '#9CA3AF');
  });
  item.classList.add('active');
  const s = item.querySelector('svg'); if (s) s.setAttribute('stroke', '#7C3AED');
}

/* ── Speech bubble ── */
let speechMessages = LANGS.en.speech;
let msgIdx = 0;
const speechEl = $('speech');
__iv = setInterval(() => {
  msgIdx = (msgIdx + 1) % speechMessages.length;
  speechEl.style.animation = 'none'; speechEl.offsetHeight;
  speechEl.style.animation = '';
  speechEl.textContent = speechMessages[msgIdx];
}, 4200);


const onClick = (e) => {
  const el = e.target.closest("[data-act]"); if (!el || !root.contains(el)) return;
  const a = el.dataset.act;
  if (a === "cycle") cycleLang();
  else if (a === "lang") setLang(el.dataset.lang);
  else if (a === "card") cardTap(el, Number(el.dataset.reward));
  else if (a === "mic") micTap();
  else if (a === "nav") navTap(el);
};
root.addEventListener("click", onClick);
return () => {
  cancelAnimationFrame(__raf); clearInterval(__iv);
  window.removeEventListener("resize", resize);
  root.removeEventListener("click", onClick);
};
}
