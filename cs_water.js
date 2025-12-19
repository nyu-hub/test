/* cs_water.js
   ✅ 물방울 "전용" 투명 오버레이 캔버스(HTML canvas)
   ✅ 텍스트(HTML) 위에 렌더링됨 (맨 앞)
   ✅ pointer-events: none 이라 UI 클릭 방해 안 함
   ✅ 켜짐/꺼짐(toggle) 지원
   ✅ 물방울 드래그 시 텍스트 드래그(선택) 방지
   ✅ (중요) 물방울에 닿은 글자:
       - 원래 자리에서는 투명(=없어진 것처럼) 처리 → 레이아웃 유지
       - 복제 글자만 물색으로 아래로 떨어지며 사라짐
   ✅ (추가) 떨어지는 물방울에도 닿으면 씻김 유지
   ✅ (추가) 이미 투명화된 글자는 다시 떨어지는 FX 절대 안 뜸
*/

(function () {
  const WATER_RGB = [100, 180, 255];

  const state = {
    enabled: false,
    drops: [],
    spawning: false,
    px: 0,
    py: 0,

    canvas: null,
    ctx: null,
    dpr: 1,
    w: 0,
    h: 0,

    _bound: false,

    // 텍스트 워시용
    rootEl: null, // #wikiContent
    lastHitTime: 0,
    hitCooldownMs: 18,
    touchedChars: new Set(), // (텍스트노드 기반 1차 중복 방지)
  };

  // ------------------------------
  // Drop
  // ------------------------------
  class Drop {
    constructor(x, y) {
      this.x = x + rand(-10, 10);
      this.y = y + rand(-10, 10);
      this.vx = rand(-1, 1);
      this.vy = rand(-2, 1);
      this.size = rand(8, 16);
      this.alpha = 1; // 0..1
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.2;
      this.vx *= 0.99;
      this.alpha -= 0.012;
    }
  }

  // ------------------------------
  // Utils
  // ------------------------------
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function nowMs() {
    return performance.now ? performance.now() : Date.now();
  }
  function isUIEventTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (
      tag === "input" ||
      tag === "button" ||
      tag === "textarea" ||
      tag === "select"
    )
      return true;
    if (t.isContentEditable) return true;
    return false;
  }

  // ✅ 이미 씻긴(투명화 처리된) 글자인지 확인
  function isAlreadyWashedNode(node) {
    if (!node) return false;

    // 텍스트 노드면 부모에서 검사
    const el = node.nodeType === 3 ? node.parentElement : node;

    if (!el || !el.closest) return false;

    const washed = el.closest(".cswater-char[data-washed='1']");
    return !!washed;
  }

  // ------------------------------
  // Canvas create/resize
  // ------------------------------
  function ensureCanvas() {
    if (state.canvas) return;

    // CSS 1회 주입
    if (!document.getElementById("cswater-style")) {
      const st = document.createElement("style");
      st.id = "cswater-style";
      st.textContent = `
        body.cswater-no-select, body.cswater-no-select *{
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }

        /* ✅ 원본 글자 감쌀 때: 폭 고정 */
        .cswater-char{
          display:inline-block;
          position:relative;
        }

        /* ✅ 씻겨 내려가는 복제 글자 (레이아웃 영향 없음) */
        .cswater-fx{
          position:fixed;
          left:0;
          top:0;
          pointer-events:none;
          will-change: transform, opacity, filter;
          white-space:pre;
          font: inherit;
        }

        @keyframes cswater-washdown{
          0%   { transform: translateY(0px);  opacity:1;   filter: blur(0px); }
          60%  { transform: translateY(24px); opacity:0.9; filter: blur(0px); }
          100% { transform: translateY(90px); opacity:0;   filter: blur(1px); }
        }
      `;
      document.head.appendChild(st);
    }

    const c = document.createElement("canvas");
    c.style.position = "fixed";
    c.style.left = "0";
    c.style.top = "0";
    c.style.width = "100vw";
    c.style.height = "100vh";
    c.style.zIndex = "999999";
    c.style.pointerEvents = "none";
    c.style.background = "transparent";
    c.setAttribute("aria-hidden", "true");

    document.body.appendChild(c);

    state.canvas = c;
    state.ctx = c.getContext("2d");
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!state.canvas) return;
    state.dpr = Math.max(1, window.devicePixelRatio || 1);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    state.canvas.width = Math.floor(state.w * state.dpr);
    state.canvas.height = Math.floor(state.h * state.dpr);
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  // ------------------------------
  // Draw droplet (Canvas2D)
  // ------------------------------
  function drawDrop(ctx, d) {
    const a = Math.max(0, Math.min(1, d.alpha));
    if (a <= 0) return;

    ctx.save();
    ctx.translate(d.x, d.y);

    const ang = Math.atan2(d.vy, d.vx) + Math.PI / 2;
    ctx.rotate(ang);

    const s = d.size;
    ctx.fillStyle = `rgba(${WATER_RGB[0]}, ${WATER_RGB[1]}, ${WATER_RGB[2]}, ${a})`;

    ctx.beginPath();

    const tipW = 0.22;
    const tipY = 0.82;
    const tipYTop = 0.96;

    ctx.moveTo(-s * tipW, -s * tipY);
    ctx.bezierCurveTo(
      -s * (tipW * 0.35),
      -s * tipYTop,
      s * (tipW * 0.35),
      -s * tipYTop,
      s * tipW,
      -s * tipY
    );
    ctx.bezierCurveTo(s * 0.55, -s * 0.6, s * 0.75, 0, 0, s * 0.9);
    ctx.bezierCurveTo(-s * 0.75, 0, -s * 0.55, -s * 0.6, -s * tipW, -s * tipY);

    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------
  // Text hit helpers
  // ------------------------------
  function ensureRoot() {
    if (state.rootEl && document.body.contains(state.rootEl)) return;
    state.rootEl = document.getElementById("wikiContent");
  }
  function inRoot(node) {
    if (!node || !state.rootEl) return false;
    return node === state.rootEl || state.rootEl.contains(node);
  }
  function getRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
    return null;
  }

  // ✅ 특정 글자만 span으로 감싸서 "투명 처리"(자리 유지) 할 수 있게 만든다
  function wrapCharForHole(textNode, index) {
    const text = textNode.nodeValue || "";
    if (index < 0 || index >= text.length) return null;

    const ch = text[index];
    if (!ch || ch.trim() === "") return null;

    if (!textNode.__cswater_id) {
      textNode.__cswater_id = "n" + Math.random().toString(36).slice(2);
    }
    const key = textNode.__cswater_id + ":" + index;
    if (state.touchedChars.has(key)) return null;
    state.touchedChars.add(key);

    // [앞][글자][뒤]로 분리
    const before = textNode.splitText(index);
    before.splitText(1);

    const span = document.createElement("span");
    span.className = "cswater-char";
    span.textContent = before.nodeValue;

    // ✅ 이 span은 "이미 씻긴 글자"로 마킹 (중복 FX 완전 차단)
    span.dataset.washed = "1";

    before.parentNode.replaceChild(span, before);
    return span;
  }

  // ✅ 복제 글자를 fixed로 생성해서 떨어뜨린다
  function spawnFallingFxFromSpan(span, strength01) {
    const rect = span.getBoundingClientRect();

    const fx = document.createElement("span");
    fx.className = "cswater-fx";
    fx.textContent = span.textContent;

    // 물색
    const a = 0.9;
    fx.style.color = `rgba(${WATER_RGB[0]}, ${WATER_RGB[1]}, ${WATER_RGB[2]}, ${a})`;

    // 원본 폰트/스타일 최대한 따라가게
    const cs = window.getComputedStyle(span);
    fx.style.font = cs.font;
    fx.style.letterSpacing = cs.letterSpacing;
    fx.style.transform = "translateY(0px)";

    fx.style.left = rect.left + "px";
    fx.style.top = rect.top + "px";

    // 젖을수록(강할수록) 더 빠르게 (원래 로직 유지)
    const dur = 520 - Math.floor(160 * Math.max(0, Math.min(1, strength01)));
    fx.style.animation = `cswater-washdown ${dur}ms ease-in forwards`;

    document.body.appendChild(fx);

    fx.addEventListener(
      "animationend",
      () => {
        if (fx && fx.parentNode) fx.parentNode.removeChild(fx);
      },
      { once: true }
    );
  }

  // ✅ (핵심) 닿은 글자: "원래 자리에서는 투명(=없어짐)" + "복제는 아래로 낙하"
  function washCharAt(x, y, strength01) {
    ensureRoot();
    if (!state.rootEl) return;

    const r = getRangeFromPoint(x, y);
    if (!r) return;

    let node = r.startContainer;
    let offset = r.startOffset;

    // ✅ 이미 씻긴 글자 위면 다시 FX 금지
    if (isAlreadyWashedNode(node)) return;

    if (node && node.nodeType === 1) {
      const child = node.childNodes[offset] || node.childNodes[offset - 1];
      if (child && child.nodeType === 3) {
        node = child;
        offset = 0;
      }
    }

    if (!node || node.nodeType !== 3) return;
    if (!inRoot(node)) return;

    // ✅ (중요) 텍스트노드가 이미 씻긴 span 내부면 여기서도 한 번 더 차단
    if (isAlreadyWashedNode(node)) return;

    const idx = Math.max(
      0,
      Math.min((node.nodeValue || "").length - 1, offset)
    );
    const span = wrapCharForHole(node, idx);
    if (!span) return;

    // 1) 원래 자리 글자 "사라짐" (폭은 유지)
    span.style.color = "transparent";
    span.style.textShadow = "none";
    span.style.filter = "none";

    // 2) 복제 글자 아래로 낙하
    spawnFallingFxFromSpan(span, strength01);
  }

  function washByDrop(d) {
    const s = d.size;
    const strength = Math.max(0, Math.min(1, (s - 8) / (16 - 8)));

    // ✅ drop은 생성된 뒤 계속 움직이므로(떨어지므로) 여기 호출만 있으면
    //    "아래로 떨어지는 물방울"에 닿아도 계속 씻겨짐
    washCharAt(d.x, d.y, strength);
    washCharAt(d.x + rand(-6, 6), d.y + rand(-6, 6), strength * 0.7);
    washCharAt(d.x + rand(-10, 10), d.y + rand(-10, 10), strength * 0.5);
  }

  // ------------------------------
  // Pointer listeners (window)
  // ------------------------------
  function onPointerDown(e) {
    if (!state.enabled) return;
    if (isUIEventTarget(e.target)) return;
    state.spawning = true;
    state.px = e.clientX;
    state.py = e.clientY;
  }

  function onPointerMove(e) {
    if (!state.enabled) return;
    if (state.spawning) e.preventDefault();
    state.px = e.clientX;
    state.py = e.clientY;
  }

  function onPointerUp() {
    state.spawning = false;
  }

  function bindEvents() {
    if (state._bound) return;
    state._bound = true;

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("resize", resizeCanvas);
  }

  function unbindEvents() {
    if (!state._bound) return;
    state._bound = false;

    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("resize", resizeCanvas);
  }

  // ------------------------------
  // Public API
  // ------------------------------
  function setEnabled(v) {
    state.enabled = !!v;

    if (state.enabled) {
      ensureCanvas();
      bindEvents();
      document.body.classList.add("cswater-no-select");
      ensureRoot();
    } else {
      state.spawning = false;
      state.drops.length = 0;
      if (state.ctx) state.ctx.clearRect(0, 0, state.w, state.h);

      unbindEvents();
      document.body.classList.remove("cswater-no-select");

      state.rootEl = null;
      state.touchedChars.clear();
    }
  }

  function toggle() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  function updateAndDraw() {
    if (!state.enabled || !state.ctx) return;

    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.w, state.h);

    if (state.spawning) {
      for (let i = 0; i < 4; i++)
        state.drops.push(new Drop(state.px, state.py));
    }

    const t = nowMs();

    for (let i = state.drops.length - 1; i >= 0; i--) {
      const d = state.drops[i];
      d.update();
      drawDrop(ctx, d);

      if (t - state.lastHitTime > state.hitCooldownMs) {
        washByDrop(d);
        state.lastHitTime = t;
      }

      if (d.alpha <= 0) state.drops.splice(i, 1);
    }
  }

  window.CSWater = {
    setEnabled,
    toggle,
    updateAndDraw,
    get enabled() {
      return state.enabled;
    },
  };
})();
