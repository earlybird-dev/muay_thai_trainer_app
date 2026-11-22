/**
 * The loading animation: a fighter in stance who bounces and throws a roundhouse kick.
 * Plain SVG + CSS (no JavaScript), so the same markup works in index.html before the app has loaded
 * (injected by vite.config.ts) and inside the app while parts of it load (<FighterLoader />).
 * Facing right; the rear leg (far side) kicks.
 */
export const FIGHTER_LOADER_SVG = `<svg class="fl-svg" viewBox="0 0 120 130" aria-hidden="true">
  <ellipse class="fl-shadow" cx="58" cy="124" rx="30" ry="3.5"/>
  <g class="fl-body">
    <g class="fl-rear-leg"><path class="fl-limb fl-far" d="M58 70 L47 96 L40 121"/><path class="fl-limb fl-far" d="M40 121 L49 121"/></g>
    <g class="fl-upper">
      <g class="fl-rear-arm"><path class="fl-limb fl-far" d="M60 34 L50 47 L63 30"/><circle class="fl-glove" cx="63" cy="30" r="5.2"/></g>
      <path class="fl-limb" d="M58 70 L61 34"/>
      <circle class="fl-head" cx="62" cy="21" r="8.5"/>
      <path class="fl-band" d="M54.5 18.5 q8 -5 15 0"/>
      <g class="fl-lead-arm"><path class="fl-limb" d="M61 34 L73 46 L75 29"/><circle class="fl-glove" cx="75" cy="29" r="5.2"/></g>
    </g>
    <rect class="fl-shorts" x="51" y="64" width="15" height="11" rx="3"/>
    <path class="fl-limb" d="M58 70 L70 95 L72 121"/><path class="fl-limb" d="M72 121 L81 121"/>
  </g>
</svg>`;

export const FIGHTER_LOADER_CSS = `
.fl-svg{width:130px;height:auto;overflow:visible}
.fl-limb{fill:none;stroke:#f2f0ec;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.fl-far{stroke:#9b98a2}
.fl-head{fill:#f2f0ec}
.fl-band{fill:none;stroke:#e63946;stroke-width:3;stroke-linecap:round}
.fl-glove{fill:#e63946}
.fl-shorts{fill:#e63946}
.fl-shadow{fill:rgba(0,0,0,.35)}
.fl-body{animation:fl-bounce 1.8s ease-in-out infinite;transform-box:view-box;transform-origin:58px 121px}
.fl-rear-leg{animation:fl-kick 1.8s cubic-bezier(.45,0,.2,1) infinite;transform-box:view-box;transform-origin:58px 70px}
.fl-upper{animation:fl-lean 1.8s cubic-bezier(.45,0,.2,1) infinite;transform-box:view-box;transform-origin:58px 70px}
.fl-rear-arm{animation:fl-swing 1.8s cubic-bezier(.45,0,.2,1) infinite;transform-box:view-box;transform-origin:60px 34px}
@keyframes fl-bounce{0%,20%,40%{transform:translateY(0)}10%,30%{transform:translateY(-3px)}}
@keyframes fl-kick{0%,42%{transform:rotate(0)}58%,66%{transform:rotate(-102deg)}82%,100%{transform:rotate(0)}}
@keyframes fl-lean{0%,42%{transform:rotate(0)}58%,66%{transform:rotate(-22deg)}82%,100%{transform:rotate(0)}}
@keyframes fl-swing{0%,42%{transform:rotate(0)}58%,66%{transform:rotate(-70deg)}82%,100%{transform:rotate(0)}}
.fl-text{margin-top:14px;font:600 .9rem system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.04em;color:#a3a0a8}
#boot-loader{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#141416;transition:opacity .35s ease}
#boot-loader.done{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){.fl-body,.fl-rear-leg,.fl-upper,.fl-rear-arm{animation-duration:3.6s}}
`;

/** Full-screen start-up loader for index.html. */
export const BOOT_LOADER_HTML = `<style>${FIGHTER_LOADER_CSS.trim()}</style><div id="boot-loader" role="status" aria-label="Loading Muay Thai Trainer">${FIGHTER_LOADER_SVG}<div class="fl-text">Warming up…</div></div>`;
