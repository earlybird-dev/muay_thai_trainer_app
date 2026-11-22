/**
 * The loading animation: a fighter in stance who bounces and throws a 1-2 (jab, cross).
 * Plain SVG + CSS (no JavaScript), so the same markup works in index.html before the app has loaded
 * (injected by vite.config.ts) and inside the app while parts of it load (<FighterLoader />).
 * Drawn facing right, which (like the app's 2D figure) is a southpaw; `.fl-orthodox` mirrors it so an
 * orthodox fighter faces left. The lead arm (near side) jabs, the rear arm (far side) crosses.
 */
export const FIGHTER_LOADER_SVG = `<svg class="fl-svg" viewBox="0 0 120 130" aria-hidden="true">
  <ellipse class="fl-shadow" cx="58" cy="124" rx="30" ry="3.5"/>
  <g class="fl-body">
    <path class="fl-limb fl-far" d="M58 70 L47 96 L40 121"/><path class="fl-limb fl-far" d="M40 121 L49 121"/>
    <g class="fl-upper">
      <g class="fl-rear-guard"><path class="fl-limb fl-far" d="M60 34 L50 47 L63 30"/><circle class="fl-glove" cx="63" cy="30" r="5.2"/></g>
      <g class="fl-rear-out"><path class="fl-limb fl-far" d="M62 34 L80 33 L97 31"/><circle class="fl-glove" cx="98" cy="31" r="5.2"/></g>
      <path class="fl-limb" d="M58 70 L61 34"/>
      <circle class="fl-head" cx="62" cy="21" r="8.5"/>
      <path class="fl-band" d="M54.5 18.5 q8 -5 15 0"/>
      <g class="fl-lead-guard"><path class="fl-limb" d="M61 34 L73 46 L75 29"/><circle class="fl-glove" cx="75" cy="29" r="5.2"/></g>
      <g class="fl-lead-out"><path class="fl-limb" d="M61 34 L80 32 L98 30"/><circle class="fl-glove" cx="99" cy="30" r="5.2"/></g>
    </g>
    <rect class="fl-shorts" x="51" y="64" width="15" height="11" rx="3"/>
    <path class="fl-limb" d="M58 70 L70 95 L72 121"/><path class="fl-limb" d="M72 121 L81 121"/>
  </g>
</svg>`;

export const FIGHTER_LOADER_CSS = `
.fl-svg{width:130px;height:auto;overflow:visible}
.fl-orthodox .fl-svg{transform:scaleX(-1)}
.fl-limb{fill:none;stroke:#f2f0ec;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.fl-far{stroke:#9b98a2}
.fl-head{fill:#f2f0ec}
.fl-band{fill:none;stroke:#e63946;stroke-width:3;stroke-linecap:round}
.fl-glove{fill:#e63946}
.fl-shorts{fill:#e63946}
.fl-shadow{fill:rgba(0,0,0,.35)}
.fl-body{animation:fl-bounce 1.6s ease-in-out infinite;transform-box:view-box;transform-origin:58px 121px}
.fl-upper{animation:fl-turn 1.6s ease-in-out infinite;transform-box:view-box;transform-origin:58px 70px}
.fl-lead-guard{animation:fl-jab-guard 1.6s step-end infinite}
.fl-lead-out{opacity:0;animation:fl-jab-out 1.6s step-end infinite}
.fl-rear-guard{animation:fl-cross-guard 1.6s step-end infinite}
.fl-rear-out{opacity:0;animation:fl-cross-out 1.6s step-end infinite}
@keyframes fl-bounce{0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-3px)}}
@keyframes fl-turn{0%,28%{transform:rotate(0)}34%{transform:rotate(4deg)}44%{transform:rotate(0)}52%{transform:rotate(9deg)}62%,100%{transform:rotate(0)}}
@keyframes fl-jab-out{0%{opacity:0}30%{opacity:1}42%{opacity:0}}
@keyframes fl-jab-guard{0%{opacity:1}30%{opacity:0}42%{opacity:1}}
@keyframes fl-cross-out{0%{opacity:0}48%{opacity:1}62%{opacity:0}}
@keyframes fl-cross-guard{0%{opacity:1}48%{opacity:0}62%{opacity:1}}
.fl-text{margin-top:14px;font:600 .9rem system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.04em;color:#a3a0a8}
#boot-loader{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#141416;transition:opacity .35s ease}
#boot-loader.done{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){.fl-body,.fl-upper,.fl-lead-guard,.fl-lead-out,.fl-rear-guard,.fl-rear-out{animation-duration:3.2s}}
`;

/** Reads the saved stance before the app loads (same storage key as lib/storage.ts); orthodox unless southpaw. */
const STANCE_SCRIPT = `<script>(function(){var s='orthodox';try{s=(JSON.parse(localStorage.getItem('muay-thai-trainer.v1')||'{}').settings||{}).stance||s}catch(e){}if(s!=='southpaw'){var b=document.getElementById('boot-loader');if(b)b.classList.add('fl-orthodox')}})()</script>`;

/** Full-screen start-up loader for index.html. */
export const BOOT_LOADER_HTML = `<style>${FIGHTER_LOADER_CSS.trim()}</style><div id="boot-loader" role="status" aria-label="Loading Muay Thai Trainer">${FIGHTER_LOADER_SVG}<div class="fl-text">Warming up…</div></div>${STANCE_SCRIPT}`;
