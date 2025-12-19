/* cs_wipe.js
   ✅ TeachableMachine Pose(wipe 판별) 유지
   ✅ Wikipedia HTML 텍스트(#wikiContent)에 "거품이 묻도록" 처리
   ✅ excludeSentence(예외 문장) 구간 거품 금지
   ✅ sketch.js에서 window.CSWipe.toggle()로 on/off 가능
   ✅ 카메라/프리뷰는 cs_wipe_cam.js(CSWipeCam)로 분리
   ✅ 다른 아이콘 클릭 시(= 외부 resetAllEffects) CSWipe.reset() 호출 → 캠 화면 즉시 제거
*/

(function () {
  const MODEL_URL = "https://teachablemachine.withgoogle.com/models/LREhKWVtI/";

  const state = {
    enabled: false,
    started: false,

    model: null,
    maxPredictions: 0,
    label: "ready",
    lastPose: null,

    // wipe일 때 "몇 번 찍어서 묻힐지"
    spawnPerTick: 10,

    // wiki root
    rootEl: null,

    // text-node + index 중복 방지(너무 과한 래핑 방지)
    touchedChars: new Set(),

    // “완전 가림” 모드: 1글자당 1개 커버만 허용
    maxBubblesPerChar: 1,

    // ✅ 자연스러운 랜덤 범위
    coverSizeJitter: 0.16, // ±16%
    coverPosJitterPx: 8, // ±8px

    // ✅ 예외 문장(거품 금지)
    excludeSentence: "",
    _excludePreparedFor: "",
    _excludePreparedSig: "",

    predRaf: 0,
    drawRaf: 0,
  };

  // ------------------------------
  // root
  // ------------------------------
  function ensureRoot() {
    if (state.rootEl && document.body.contains(state.rootEl)) return;
    state.rootEl = document.getElementById("wikiContent");
    state._excludePreparedSig = "";
  }

  function inRoot(node) {
    return !!(state.rootEl && node && state.rootEl.contains(node));
  }

  // ------------------------------
  // style (텍스트 거품 스타일만 유지)
  // ------------------------------
  function ensureStyle() {
    if (document.getElementById("cswipe-style")) return;

    const st = document.createElement("style");
    st.id = "cswipe-style";
    st.textContent = `
      /* ✅ "거품이 글자에 묻는" 핵심 */
      .cswipe-char{
        display:inline-block;
        position:relative;
        z-index:0;
      }
      .cswipe-b{
        position:absolute;
        left:50%;
        top:55%;
        transform: translate(-50%, -50%);
        border-radius:999px;
        pointer-events:none;
        z-index: 1;

        background: rgba(190,255,255, var(--a, 0.72));
        box-shadow:
          0 0 0 1px rgba(255,255,255, calc(var(--a,0.72) * 0.35)) inset,
          0 2px 8px rgba(255,255,255, calc(var(--a,0.72) * 0.20));
        filter: blur(0.2px);
        will-change: transform, opacity;
        opacity: 1;
      }

      /* ✅ “글자 완전 가림” */
      .cswipe-char.cswipe-covered{
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
      .cswipe-b.cswipe-cover{
        animation: none !important;
        transform: translate(var(--ox, -50%), var(--oy, -50%)) !important;
      }

      /* ✅ 예외 문장 마킹(거품 금지 구간) */
      .cswipe-exclude{
        display:inline;
      }
    `;
    document.head.appendChild(st);
  }

  // ------------------------------
  // DOM helpers
  // ------------------------------
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

  function ensureExcludeMarked() {
    ensureRoot();
    if (!state.rootEl) return;

    const s = (state.excludeSentence || "").trim();
    if (!s) return;

    const sig =
      String(state.rootEl.childNodes.length) +
      ":" +
      String(state.rootEl.textContent || "").length;

    if (state._excludePreparedFor === s && state._excludePreparedSig === sig)
      return;

    // 기존 마킹 제거
    const old = state.rootEl.querySelectorAll(".cswipe-exclude");
    if (old && old.length) {
      for (const el of old) {
        const txt = document.createTextNode(el.textContent || "");
        el.parentNode && el.parentNode.replaceChild(txt, el);
      }
    }

    const walker = document.createTreeWalker(
      state.rootEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const tn0 of nodes) {
      let tn = tn0;
      let text = tn.nodeValue || "";
      let idx = text.indexOf(s);
      if (idx < 0) continue;

      let guard = 0;
      while (idx >= 0 && guard++ < 50) {
        const before = tn.splitText(idx);
        const after = before.splitText(s.length);

        const span = document.createElement("span");
        span.className = "cswipe-exclude";
        span.textContent = before.nodeValue;

        before.parentNode && before.parentNode.replaceChild(span, before);

        tn = after;
        text = tn.nodeValue || "";
        idx = text.indexOf(s);
      }
    }

    state._excludePreparedFor = s;
    state._excludePreparedSig = sig;
  }

  function isInExcluded(node) {
    if (!node) return false;
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (!el || !el.closest) return false;
    return !!el.closest(".cswipe-exclude");
  }

  function wrapChar(textNode, index) {
    const text = textNode.nodeValue || "";
    if (index < 0 || index >= text.length) return null;

    const ch = text[index];
    if (!ch || ch.trim() === "") return null;

    if (!textNode.__cswipe_id) {
      textNode.__cswipe_id = "w" + Math.random().toString(36).slice(2);
    }
    const key = textNode.__cswipe_id + ":" + index;

    if (state.touchedChars.has(key)) return null;
    state.touchedChars.add(key);

    const before = textNode.splitText(index);
    before.splitText(1);

    const span = document.createElement("span");
    span.className = "cswipe-char";
    span.textContent = before.nodeValue;

    before.parentNode.replaceChild(span, before);
    return span;
  }

  function dabBubbleAt(x, y) {
    ensureRoot();
    if (!state.rootEl) return false;

    ensureExcludeMarked();

    const r = getRangeFromPoint(x, y);
    if (!r) return false;

    let node = r.startContainer;
    let offset = r.startOffset;

    if (isInExcluded(node)) return false;

    if (node && node.nodeType === 1) {
      const child = node.childNodes[offset] || node.childNodes[offset - 1];
      if (child && child.nodeType === 3) {
        node = child;
        offset = 0;
      }
    }

    if (!node || node.nodeType !== 3) return false;
    if (!inRoot(node)) return false;
    if (isInExcluded(node)) return false;

    const idx = Math.max(
      0,
      Math.min((node.nodeValue || "").length - 1, offset)
    );

    const baseSpan = wrapChar(node, idx);
    if (!baseSpan) return false;
    if (isInExcluded(baseSpan)) return false;

    const existing = baseSpan.querySelectorAll(":scope > .cswipe-b").length;
    if (existing >= state.maxBubblesPerChar) return false;

    baseSpan.classList.add("cswipe-covered");

    const alreadyCover = baseSpan.querySelector(
      ":scope > .cswipe-b.cswipe-cover"
    );
    if (alreadyCover) return true;

    const b = document.createElement("span");
    b.className = "cswipe-b cswipe-cover";

    const rect = baseSpan.getBoundingClientRect();
    const padX = Math.max(6, rect.width * 0.55);
    const padY = Math.max(6, rect.height * 0.65);
    const baseSize = Math.max(rect.width + padX, rect.height + padY);

    const jit = state.coverSizeJitter;
    const sizeMul = 1 + rand(-jit, jit);
    const size = Math.max(10, baseSize * sizeMul);

    b.style.width = `${size}px`;
    b.style.height = `${size}px`;

    const a = rand(0.72, 0.86);
    b.style.setProperty("--a", a.toFixed(3));

    const pj = state.coverPosJitterPx;
    const jx = rand(-pj, pj);
    const jy = rand(-pj, pj);

    b.style.setProperty("--ox", `calc(-50% + ${jx.toFixed(1)}px)`);
    b.style.setProperty("--oy", `calc(-50% + ${jy.toFixed(1)}px)`);

    baseSpan.appendChild(b);
    return true;
  }

  function randomPointInRoot() {
    ensureRoot();
    if (!state.rootEl) return null;

    const r = state.rootEl.getBoundingClientRect();
    const pad = 14;

    if (r.bottom < 0 || r.top > window.innerHeight) return null;

    const x1 = Math.max(pad, r.left + pad);
    const x2 = Math.min(window.innerWidth - pad, r.right - pad);
    const y1 = Math.max(pad, Math.max(r.top + pad, pad));
    const y2 = Math.min(
      window.innerHeight - pad,
      Math.min(r.bottom - pad, window.innerHeight - pad)
    );

    if (x2 <= x1 || y2 <= y1) return null;

    return {
      x: x1 + Math.random() * (x2 - x1),
      y: y1 + Math.random() * (y2 - y1),
    };
  }

  function dabBubbleAtRandomNonExcluded(maxTries = 40) {
    ensureExcludeMarked();

    for (let t = 0; t < maxTries; t++) {
      const p = randomPointInRoot();
      if (!p) return false;

      const x = p.x + rand(-8, 8);
      const y = p.y + rand(-10, 8);

      if (dabBubbleAt(x, y)) return true;
    }
    return false;
  }

  // ------------------------------
  // TeachableMachine Pose
  // ------------------------------
  async function startPose() {
    if (state.started) return;

    ensureStyle();

    if (!window.CSWipeCam) {
      console.warn(
        "[CSWipe] CSWipeCam이 없습니다. cs_wipe_cam.js를 먼저 로드하세요."
      );
      return;
    }
    if (!window.tmPose || !window.tmPose.load) {
      console.warn(
        "[CSWipe] tmPose가 없습니다. tfjs + teachablemachine-pose를 추가하세요."
      );
      return;
    }

    // ✅ 카메라 + 프리뷰는 CSWipeCam이 담당
    await window.CSWipeCam.start({
      W: 180,
      H: 135,
      left: 70,
      top: 12,
      mirror: true,
    });
    window.CSWipeCam.setBadge("STARTING...");

    const modelURL = MODEL_URL + "model.json";
    const metadataURL = MODEL_URL + "metadata.json";
    state.model = await window.tmPose.load(modelURL, metadataURL);
    state.maxPredictions = state.model.getTotalClasses();

    state.started = true;
    state.enabled = true;

    if (!state.predRaf) state.predRaf = requestAnimationFrame(predictLoop);
    if (!state.drawRaf) state.drawRaf = requestAnimationFrame(drawLoop);

    window.CSWipeCam.setBadge("READY");
  }

  async function predictLoop() {
    state.predRaf = requestAnimationFrame(predictLoop);
    if (!state.started || !state.model || !window.CSWipeCam) return;

    const video = window.CSWipeCam.getVideo();
    if (!video) return;

    const { pose, posenetOutput } = await state.model.estimatePose(video);
    state.lastPose = pose || null;

    const prediction = await state.model.predict(posenetOutput);

    let topLabel = "ready";
    let topProb = 0;
    for (let i = 0; i < prediction.length; i++) {
      const p = prediction[i];
      if (p.probability > topProb) {
        topProb = p.probability;
        topLabel = p.className;
      }
    }
    state.label = topLabel;

    // 배지 업데이트
    const tag = state.enabled ? `ON • ${state.label}` : `OFF • ${state.label}`;
    window.CSWipeCam.setBadge(tag);
  }

  function drawLoop() {
    state.drawRaf = requestAnimationFrame(drawLoop);

    // ✅ 프리뷰 드로우는 분리 모듈이 담당
    if (state.started && window.CSWipeCam) {
      window.CSWipeCam.draw(state.lastPose);
    }

    if (!state.enabled) return;

    ensureRoot();
    ensureExcludeMarked();

    if (state.started && state.label === "wipe") {
      for (let i = 0; i < state.spawnPerTick; i++) {
        dabBubbleAtRandomNonExcluded(40);
      }
    }
  }

  // ------------------------------
  // Public API
  // ------------------------------
  function setEnabled(v) {
    state.enabled = !!v;

    // ✅ OFF되면 프리뷰는 사라지게(다시 ON이면 started 상태면 startPose로 복귀)
    if (!state.enabled && window.CSWipeCam) {
      // 프리뷰만 숨길 수도 있지만, 니 요구사항은 “다른 아이콘 클릭 시 사라짐”이라 reset에서 확실히 제거
      window.CSWipeCam.hide(true);
    }
  }

  function toggle() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  function setExcludeSentence(s) {
    state.excludeSentence = String(s || "");
    state._excludePreparedFor = "";
    state._excludePreparedSig = "";
  }

  // ✅ 외부(다른 아이콘 클릭 시)에서 호출: 캠 화면도 같이 제거되게
  function reset() {
    if (state.touchedChars) state.touchedChars.clear();
    state._excludePreparedFor = "";
    state._excludePreparedSig = "";

    // 카메라/프리뷰 완전 종료
    window.CSWipeCam?.reset?.();

    // 원하면 여기서 pose loop도 끊을 수 있음(필요하면 켜)
    // if (state.predRaf) cancelAnimationFrame(state.predRaf);
    // if (state.drawRaf) cancelAnimationFrame(state.drawRaf);
    // state.predRaf = 0; state.drawRaf = 0;

    // 권한 상태 유지하고 싶으면 started 유지
    // 완전 초기화 원하면 아래 켜기
    // state.started = false; state.model = null; state.maxPredictions = 0; state.label = "ready"; state.lastPose = null;

    state.enabled = false;
  }

  // ------------------------------
  // Boot
  // ------------------------------
  function boot() {
    // drawLoop는 항상 돌게(프리뷰는 started일 때만)
    if (!state.drawRaf) state.drawRaf = requestAnimationFrame(drawLoop);
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

  window.CSWipe = {
    startPose,
    setEnabled,
    toggle,
    reset,

    setExcludeSentence,

    get enabled() {
      return state.enabled;
    },
    get started() {
      return state.started;
    },
    get label() {
      return state.label;
    },
  };
})();
