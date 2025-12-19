/* cs_mic.js
   ✅ Wikipedia HTML 텍스트(#wikiContent)에 "마이크 큰소리 → 글자 바람에 흩날림" 효과 주입
   ✅ 핵심문장(예외문장)은 절대 날아가지 않음
       - pickTopSentences(fullExtract, 6) 기반
       - ✅ 핵심문장은 #wikiContent DOM 안에서 실제로 <span class="csmic-core">로 래핑해서 “보호구역” 생성
   ✅ start_mic 버튼은 곤색 원형 버튼(extraBtnDom) 옆에 자동 배치 (uiLayout.js 수정 X)

   ✅ 글자가 날아가도 레이아웃/위치 유지:
       - 날아간 글자 자리에는 같은 글자를 남기되 투명 처리(자리표시자)
   ✅ 스크롤해도 낑기지 않게:
       - 날아가는 것은 fixed “고스트”만, 화면 밖 나가면 remove
   ✅ summaryP 영역은 완전 제외(핵심문장 리스트가 날아가지 않게)
*/

(function () {
  const CFG = {
    FRAME_GAP: 2,
    SPAWN_MIN: 2,
    SPAWN_MAX: 7,
    TRY_PER_SPAWN: 28,
    MAX_PARTICLES: 1600,

    WIND_X: 0.04,
    WIND_Y: 0.03,
    UP_WIND_Y: -0.018,

    OUT_PAD: 520,

    // core DOM marking
    CORE_MARK_COOLDOWN_MS: 900,
    CORE_ANCHOR_LEN: 18, // 정규화한 문자열 기준 앵커 길이(너무 짧으면 오탐↑)
  };

  const state = {
    enabled: false,
    started: false,
    micStarted: false,
    mic: null,
    amp: null,
    threshold: 0.08,

    rootEl: null, // #wikiContent
    summaryEl: null, // summaryP.elt

    touched: new Set(),

    frame: 0,
    frameGap: CFG.FRAME_GAP,

    particles: new Map(), // ghostEl -> particleState
    raf: 0,

    btn: null,
    btnMounted: false,
    uiRaf: 0,

    // core 보호
    coreSentences: [],
    coreKeys: new Set(),
    coreStamp: "",
    lastCoreBuildMs: 0,

    // ✅ core DOM 래핑(보호구역) 캐시
    lastCoreMarkMs: 0,
    coreMarkedStamp: "",
  };

  // ------------------------------
  // CSS
  // ------------------------------
  function ensureStyle() {
    if (document.getElementById("csmic-style")) return;

    const st = document.createElement("style");
    st.id = "csmic-style";
    st.textContent = `
      .csmic-btn{
        width:42px; height:42px;
        border-radius:999px;
        background: rgba(20,60,120,0);
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        display:grid; place-items:center;
        cursor:pointer;
        user-select:none;
        -webkit-user-select:none;
        font-family: Arial, 'Apple SD Gothic Neo', 'Noto Sans KR';
        color:#fff;
        font-size:11px;
        letter-spacing:0.2px;
        line-height:1;
      }
      .csmic-btn[data-on="1"]{
        background: rgba(20,60,120,0);
        box-shadow: 0 10px 22px rgba(0,0,0,0.16);
      }

      .csmic-char{
        display:inline-block;
        position:relative;
        will-change: transform;
      }

      /* ✅ 자리표시자(투명 글자) — 레이아웃 유지 */
      .csmic-placeholder{
        color: transparent !important;
        text-shadow: none !important;
        -webkit-text-fill-color: transparent !important;
        opacity: 1 !important;
      }

      /* ✅ 코어 문장 보호구역 */
      .csmic-core{
        /* 필요하면 강조도 가능(지금은 “남기기” 목적이라 기본 검정 유지) */
        color: #111 !important;
        -webkit-text-fill-color: #111 !important;
      }

      /* fixed 고스트 */
      .csmic-ghost{
        position: fixed;
        pointer-events:none;
        margin:0;
        padding:0;
        will-change: transform;
        z-index: 9999;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureRoot() {
    if (!state.rootEl || !document.body.contains(state.rootEl)) {
      state.rootEl = document.getElementById("wikiContent");
    }
  }

  function ensureSummaryEl() {
    if (window.summaryP && window.summaryP.elt) {
      state.summaryEl = window.summaryP.elt;
      return;
    }
    state.summaryEl = null;
  }

  function inRoot(node) {
    return !!(state.rootEl && node && state.rootEl.contains(node));
  }

  function isInSummary(node) {
    const s = state.summaryEl;
    return !!(s && node && s.contains(node));
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

  // ------------------------------
  // Core sentence build
  // ------------------------------
  function _normKey(s) {
    return (s || "")
      .toString()
      .replace(/\s+/g, "")
      .replace(/[“”"'‘’]/g, "")
      .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "")
      .trim()
      .toLowerCase();
  }

  function rebuildCoreIfNeeded(force = false) {
    const now = performance.now ? performance.now() : Date.now();
    if (!force && now - state.lastCoreBuildMs < 700) return;

    const fe = typeof window.fullExtract === "string" ? window.fullExtract : "";
    const ct =
      typeof window.currentTitle === "string" ? window.currentTitle : "";
    const stamp = `${ct}::${fe.length}`;

    if (!force && stamp === state.coreStamp && state.coreKeys.size) return;

    state.coreStamp = stamp;
    state.lastCoreBuildMs = now;

    state.coreSentences = [];
    state.coreKeys.clear();

    if (typeof window.pickTopSentences === "function" && fe) {
      const arr = window.pickTopSentences(fe, 6) || [];
      state.coreSentences = arr;
      for (const s of arr) {
        const k = _normKey(s);
        if (k) state.coreKeys.add(k);
      }
    }

    // ✅ core가 갱신되면 DOM에 보호구역도 다시 찍기
    markCoreInDOM(true);
  }

  // ------------------------------
  // ✅ 핵심문장을 DOM에 “보호구역 span”으로 박기
  // ------------------------------
  function markCoreInDOM(force = false) {
    ensureRoot();
    if (!state.rootEl) return;
    if (!state.coreSentences.length) return;

    const now = performance.now ? performance.now() : Date.now();
    if (!force && now - state.lastCoreMarkMs < CFG.CORE_MARK_COOLDOWN_MS)
      return;

    // 문서가 바뀌었는지 감지(대충)
    const fe = typeof window.fullExtract === "string" ? window.fullExtract : "";
    const ct =
      typeof window.currentTitle === "string" ? window.currentTitle : "";
    const stamp = `${ct}::${fe.length}::${
      state.coreSentences.join("|").length
    }`;

    if (!force && stamp === state.coreMarkedStamp) return;

    state.lastCoreMarkMs = now;
    state.coreMarkedStamp = stamp;

    // 문장별로 “앵커”를 만들어서 텍스트 노드에서 찾아 래핑
    const anchors = state.coreSentences
      .map((s) => {
        const nk = _normKey(s);
        if (!nk) return null;
        // 앵커는 앞부분을 쓰되 너무 짧으면 오탐 많음
        const a = nk.slice(0, Math.min(CFG.CORE_ANCHOR_LEN, nk.length));
        if (a.length < 10) return null;
        return a;
      })
      .filter(Boolean);

    if (!anchors.length) return;

    // 이미 래핑된 core는 놔두고, 새로 찾은 부분만 래핑한다.
    // TreeWalker로 텍스트노드 순회
    const walker = document.createTreeWalker(
      state.rootEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
          // summary 영역 제외
          if (isInSummary(node)) return NodeFilter.FILTER_REJECT;
          // 이미 core 내부 제외
          if (node.parentElement && node.parentElement.closest(".csmic-core"))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    // 문장 앵커를 텍스트노드에서 찾고, 찾으면 주변을 “문장 느낌” 범위로 확장해서 래핑
    for (const tn of textNodes) {
      const raw = tn.nodeValue || "";
      if (raw.length < 6) continue;

      // 정규화 문자열과 원본 인덱스 매핑 만들기
      const map = buildNormMap(raw);
      const norm = map.norm;

      if (!norm) continue;

      for (const anc of anchors) {
        const i = norm.indexOf(anc);
        if (i === -1) continue;

        // 앵커가 발견된 근처에서 원본 텍스트 기준으로 문장 범위(대충 .?!\n) 확장
        const approxRawIdx = map.normToRaw[i] ?? 0;
        const seg = expandSentenceRange(raw, approxRawIdx);

        // 너무 짧으면 래핑 안 함
        if (seg.end - seg.start < 8) continue;

        // Range로 감싸기(텍스트 노드 하나 안에서만 처리)
        tryWrapTextNodeRange(tn, seg.start, seg.end);
      }
    }
  }

  // raw -> norm(공백/기호 제거) + norm index -> raw index 매핑
  function buildNormMap(raw) {
    const normToRaw = [];
    let norm = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];

      // 공백류 제거
      if (/\s/.test(c)) continue;

      // 따옴표 제거
      if (/[“”"'‘’]/.test(c)) continue;

      // 허용 문자만
      const ok = /[\uAC00-\uD7A3a-zA-Z0-9]/.test(c);
      if (!ok) continue;

      normToRaw[norm.length] = i;
      norm += c.toLowerCase();
    }
    return { norm, normToRaw };
  }

  function expandSentenceRange(raw, idx) {
    let L = idx;
    while (L > 0) {
      const c = raw[L - 1];
      if (c === "." || c === "?" || c === "!" || c === "\n") break;
      L--;
    }
    let R = idx;
    while (R < raw.length) {
      const c = raw[R];
      if (c === "." || c === "?" || c === "!" || c === "\n") {
        R++;
        break;
      }
      R++;
    }
    return { start: L, end: R };
  }

  function tryWrapTextNodeRange(textNode, start, end) {
    if (!textNode || textNode.nodeType !== 3) return false;
    const txt = textNode.nodeValue || "";
    if (start < 0 || end > txt.length || end <= start) return false;

    // 이미 일부가 래핑된 경우 방지: 주변에 core가 있으면 스킵
    const parent = textNode.parentElement;
    if (parent && parent.closest(".csmic-core")) return false;

    // splitText로 정확히 분리해서 감싸기
    const head = textNode.splitText(start);
    const mid = head.splitText(end - start);

    const span = document.createElement("span");
    span.className = "csmic-core";
    span.textContent = head.nodeValue;

    head.parentNode.replaceChild(span, head);
    return true;
  }

  // ------------------------------
  // ✅ core 판별: “DOM 보호구역”이 최우선
  // ------------------------------
  function isCoreChar(textNode, index) {
    if (!textNode || textNode.nodeType !== 3) return false;

    // 0) DOM에서 core span 내부면 무조건 보호
    if (textNode.parentElement && textNode.parentElement.closest(".csmic-core"))
      return true;

    // 1) (fallback) 기존 키 기반도 남겨두기
    if (!state.coreKeys.size) return false;

    const t = textNode.nodeValue || "";
    const local = extractLocalSentence(t, index);
    if (!local) return false;

    const lk = _normKey(local);
    if (!lk) return false;

    if (state.coreKeys.has(lk)) return true;

    for (const ck of state.coreKeys) {
      if (!ck) continue;
      if (lk.includes(ck) || ck.includes(lk)) return true;
    }
    return false;
  }

  function extractLocalSentence(text, idx) {
    const s = text || "";
    if (!s) return "";
    let L = idx;
    while (L > 0) {
      const c = s[L - 1];
      if (c === "." || c === "?" || c === "!" || c === "\n") break;
      L--;
    }
    let R = idx;
    while (R < s.length) {
      const c = s[R];
      if (c === "." || c === "?" || c === "!" || c === "\n") break;
      R++;
    }
    return s.slice(Math.max(0, L), Math.min(s.length, R + 1)).trim();
  }

  // ------------------------------
  // spawn point (summary/core 피하기)
  // ------------------------------
  function randomPointInRootAvoidProtected() {
    ensureRoot();
    ensureSummaryEl();
    if (!state.rootEl) return null;

    const r = state.rootEl.getBoundingClientRect();
    const pad = 12;

    if (r.bottom < 0 || r.top > window.innerHeight) return null;

    const x1 = Math.max(pad, r.left + pad);
    const x2 = Math.min(window.innerWidth - pad, r.right - pad);
    const y1 = Math.max(pad, Math.max(r.top + pad, pad));
    const y2 = Math.min(
      window.innerHeight - pad,
      Math.min(r.bottom - pad, window.innerHeight - pad)
    );

    if (x2 <= x1 || y2 <= y1) return null;

    for (let i = 0; i < 22; i++) {
      const x = x1 + Math.random() * (x2 - x1);
      const y = y1 + Math.random() * (y2 - y1);

      const el = document.elementFromPoint(x, y);
      if (!el) continue;

      if (state.summaryEl && state.summaryEl.contains(el)) continue;
      if (el.closest && el.closest(".csmic-core")) continue; // ✅ core 영역 피하기

      return { x, y };
    }
    return null;
  }

  // ------------------------------
  // wrap char
  // ------------------------------
  function wrapChar(textNode, index) {
    const text = textNode.nodeValue || "";
    if (index < 0 || index >= text.length) return null;

    const ch = text[index];
    if (!ch || ch.trim() === "") return null;

    // ✅ core 보호
    if (isCoreChar(textNode, index)) return null;

    if (!textNode.__csmic_id) {
      textNode.__csmic_id = "m" + Math.random().toString(36).slice(2);
    }
    const key = textNode.__csmic_id + ":" + index;
    if (state.touched.has(key)) return null;
    state.touched.add(key);

    const before = textNode.splitText(index);
    before.splitText(1);

    const span = document.createElement("span");
    span.className = "csmic-char";
    span.textContent = before.nodeValue;

    before.parentNode.replaceChild(span, before);
    return span;
  }

  function makePlaceholder(span) {
    span.classList.add("csmic-placeholder");
    span.dataset.csmicPlaceholder = "1";
  }

  function detachToFixed(span) {
    if (!span || !span.isConnected) return null;
    if (span.dataset.csmicPlaceholder === "1") return null;

    const ch = span.textContent || "";
    if (!ch.trim()) return null;

    const r = span.getBoundingClientRect();

    const ghost = document.createElement("span");
    ghost.className = "csmic-char csmic-ghost";
    ghost.textContent = ch;

    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;

    const cs = window.getComputedStyle(span);
    ghost.style.font = cs.font;
    ghost.style.letterSpacing = cs.letterSpacing;
    ghost.style.whiteSpace = "pre";

    document.body.appendChild(ghost);

    // ✅ 원문은 투명 자리표시자로
    makePlaceholder(span);

    return ghost;
  }

  function makeParticleFromSpan(span) {
    if (!span) return;
    if (state.particles.size >= CFG.MAX_PARTICLES) return;

    const ghost = detachToFixed(span);
    if (!ghost) return;

    const up = Math.random() < 0.42;
    const vx = up ? rand(2.4, 5.0) : rand(2.8, 5.8);
    const vy = up ? rand(-3.2, -0.8) : rand(1.2, 3.6);

    const dir = Math.random() < 0.5 ? -1 : 1;
    const angle = rand(-0.55, 0.55);
    const angVel = rand(0.04, 0.11) * dir;

    state.particles.set(ghost, {
      dx: 0,
      dy: 0,
      vx,
      vy,
      angle,
      angVel,
      up,
      seed: Math.random() * 999,
    });
  }

  function flyCharAt(x, y) {
    ensureRoot();
    ensureSummaryEl();
    if (!state.rootEl) return false;

    // ✅ core 최신 + DOM 보호구역 찍기
    rebuildCoreIfNeeded(false);
    markCoreInDOM(false);

    const range = getRangeFromPoint(x, y);
    if (!range) return false;

    let node = range.startContainer;
    let offset = range.startOffset;

    if (node && node.nodeType === 1) {
      const child = node.childNodes[offset] || node.childNodes[offset - 1];
      if (child && child.nodeType === 3) {
        node = child;
        offset = 0;
      }
    }

    if (!node || node.nodeType !== 3) return false;
    if (!inRoot(node)) return false;

    // ✅ summaryP는 절대 건드리지 않음
    if (isInSummary(node)) return false;

    const idx = Math.max(
      0,
      Math.min((node.nodeValue || "").length - 1, offset)
    );

    // ✅ core면 스킵
    if (isCoreChar(node, idx)) return false;

    const span = wrapChar(node, idx);
    if (!span) return false;

    makeParticleFromSpan(span);
    return true;
  }

  // ------------------------------
  // Mic init
  // ------------------------------
  function initAudio() {
    if (state.started) return;
    state.started = true;

    if (
      typeof getAudioContext !== "function" ||
      typeof p5 === "undefined" ||
      !p5.AudioIn
    ) {
      console.warn("[CSMic] p5.sound이 필요합니다.");
      return;
    }

    const ac = getAudioContext();
    if (ac && ac.state !== "running") ac.resume();

    state.mic = new p5.AudioIn();
    state.mic.start(
      () => {
        state.micStarted = true;
        state.amp = new p5.Amplitude();
        state.amp.setInput(state.mic);

        rebuildCoreIfNeeded(true); // core keys + DOM 보호구역 생성
        setEnabled(true);
        renderBtn();
      },
      (err) => console.log("[CSMic] mic error", err)
    );
  }

  // ------------------------------
  // Loop
  // ------------------------------
  function loop() {
    state.raf = requestAnimationFrame(loop);
    if (!state.enabled) return;
    if (!state.micStarted || !state.amp) return;

    const level = state.amp.getLevel ? state.amp.getLevel() : 0;
    const isLoud = level > state.threshold;

    if (isLoud) {
      state.frame++;
      if (state.frame % state.frameGap === 0) {
        // loud일 때마다 core 보호구역 유지(문서가 바뀌면 다시 찍힘)
        rebuildCoreIfNeeded(false);
        markCoreInDOM(false);

        const t = clamp01((level - state.threshold) / 0.18);
        const count = Math.round(lerp(CFG.SPAWN_MIN, CFG.SPAWN_MAX, t));

        for (let i = 0; i < count; i++) {
          let ok = false;
          for (let tries = 0; tries < CFG.TRY_PER_SPAWN; tries++) {
            const p = randomPointInRootAvoidProtected();
            if (!p) break;

            ok = flyCharAt(
              p.x + (Math.random() * 12 - 6),
              p.y + (Math.random() * 12 - 6)
            );
            if (ok) break;
          }
        }
      }
    } else {
      state.frame = 0;
    }

    const windX = CFG.WIND_X;
    const windY = CFG.WIND_Y;
    const upWindY = CFG.UP_WIND_Y;

    const tBase = performance.now() * 0.001 * 3.6;

    for (const [ghost, P] of state.particles) {
      if (!ghost || !ghost.isConnected) {
        state.particles.delete(ghost);
        continue;
      }

      const t = tBase + P.seed * 0.5;

      if (P.up) {
        P.vx += windX * 0.75;
        P.vy += upWindY;

        P.dx += P.vx + Math.cos(t) * 0.55;
        P.dy += P.vy + Math.sin(t * 0.8) * 0.35;
      } else {
        P.vx += windX;
        P.vy += 0.12 + windY;

        P.dx += P.vx + Math.cos(t) * 0.65;
        P.dy += P.vy + Math.sin(t * 0.8) * 0.35;
      }

      P.angVel += rand(-0.002, 0.002);
      P.angle += P.angVel;

      ghost.style.transform = `translate(${P.dx.toFixed(2)}px, ${P.dy.toFixed(
        2
      )}px) rotate(${P.angle.toFixed(3)}rad)`;

      const rect = ghost.getBoundingClientRect();
      const OUT = CFG.OUT_PAD;

      if (
        rect.right < -OUT ||
        rect.left > window.innerWidth + OUT ||
        rect.bottom < -OUT ||
        rect.top > window.innerHeight + OUT
      ) {
        ghost.remove();
        state.particles.delete(ghost);
      }
    }

    if (state.touched.size > 24000) {
      const keep = new Set();
      let i = 0;
      for (const k of state.touched) if (i++ % 2 === 0) keep.add(k);
      state.touched = keep;
    }
  }

  function resetParticles() {
    for (const [ghost] of state.particles) {
      if (ghost && ghost.isConnected) ghost.remove();
    }
    state.particles.clear();
  }

  // ------------------------------
  // UI button
  // ------------------------------
  function mountButton() {
    if (state.btnMounted) return;
    ensureStyle();

    const d = typeof createDiv === "function" ? createDiv("MIC") : null;

    let el;
    if (d) {
      d.class("csmic-btn");
      d.elt.dataset.on = "0";
      d.mousePressed(() => {
        if (!state.micStarted) initAudio();
        else toggle();
      });
      el = d.elt;
      state.btn = d;
    } else {
      el = document.createElement("div");
      el.textContent = "";
      el.className = "csmic-btn";
      el.dataset.on = "0";
      el.addEventListener("click", () =>
        !state.micStarted ? initAudio() : toggle()
      );
      document.body.appendChild(el);
      state.btn = { elt: el };
    }

    el.style.position = "fixed";
    el.style.zIndex = "9998";
    el.style.left = "0px";
    el.style.top = "0px";

    state.btnMounted = true;
    followExtraButton();
  }

  function getExtraButtonElement() {
    if (window.extraBtnDom && window.extraBtnDom.elt)
      return window.extraBtnDom.elt;
    return null;
  }

  function followExtraButton() {
    cancelAnimationFrame(state.uiRaf);

    const tick = () => {
      state.uiRaf = requestAnimationFrame(tick);

      const extraEl = getExtraButtonElement();
      if (!extraEl || !state.btn || !state.btn.elt) return;

      const r = extraEl.getBoundingClientRect();

      const SIZE = 42;
      const GAP = 12;

      const x = Math.round(r.right + GAP);
      const y = Math.round(r.top + r.height / 2 - SIZE / 2);

      state.btn.elt.style.left = `${x}px`;
      state.btn.elt.style.top = `${y}px`;
    };
    tick();
  }

  function renderBtn() {
    if (!state.btn) return;
    state.btn.elt.dataset.on = state.enabled ? "1" : "0";
    state.btn.elt.textContent = "";
  }

  function setEnabled(v) {
    state.enabled = !!v;
    renderBtn();
    if (state.enabled) {
      rebuildCoreIfNeeded(true);
      markCoreInDOM(true);
    }
  }

  function toggle() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  // ------------------------------
  // Boot
  // ------------------------------
  function boot() {
    ensureRoot();
    ensureSummaryEl();
    mountButton();
    if (!state.raf) state.raf = requestAnimationFrame(loop);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(boot, 0);
  } else {
    window.addEventListener("DOMContentLoaded", boot, { once: true });
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  window.CSMic = {
    initAudio,
    setEnabled,
    toggle,
    reset: resetParticles,
    get coreSentences() {
      return state.coreSentences.slice();
    },
    get enabled() {
      return state.enabled;
    },
    get micStarted() {
      return state.micStarted;
    },
    // 디버그: DOM에 core span 찍기 강제
    markCoreNow() {
      rebuildCoreIfNeeded(true);
      markCoreInDOM(true);
    },
  };
})();
