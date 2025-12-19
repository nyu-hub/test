// uiLayout.js
// ✅ HTML UI 생성/스타일/레이아웃만 전담
// ✅ (변경) cs_mic/cs_shake/cs_wipe "권한 허용(START)" 버튼을 1개로 통합
// ✅ 아이콘(1/2/3) 선택에 따라 버튼 역할이 바뀜 (MIC / SENSORS / CAMERA)

function _uiFontFamily() {
  return "Arial, 'Apple SD Gothic Neo', 'Noto Sans KR'";
}

function applyBaseBodyStyle() {
  document.body.style.background = "rgb(175, 215, 255)";
  document.body.style.overflowY = "auto";
  document.body.style.margin = "0";
}

function createTitleDom() {
  titleDom = createImg("cs_title_4.png", "Cleaning Service");
  titleDom.style("position", "relative");
  titleDom.style("display", "block");
  titleDom.style("margin-left", "6vw");
  titleDom.style("margin-top", "4vh");
  titleDom.style("width", "min(max(17vw, 220px), 320px)");
  titleDom.style("height", "auto");
  titleDom.style("pointer-events", "none");
}

function createSearchBarDom() {
  searchWrap = createDiv("");
  searchWrap.style("position", "relative");
  searchWrap.style("margin-left", "6.3vw");
  searchWrap.style("margin-top", "1.5vh");
  searchWrap.style("width", "30vw");
  searchWrap.style("min-width", "320px");
  searchWrap.style("max-width", "520px");
  searchWrap.style("height", "46px");
  searchWrap.style("background", "#fff");
  searchWrap.style("border-radius", "999px");
  searchWrap.style("display", "flex");
  searchWrap.style("align-items", "center");
  searchWrap.style("padding", "0 10px");
  searchWrap.style("box-sizing", "border-box");
  searchWrap.style("gap", "10px");

  searchInput = createInput(keyword || "");
  searchInput.attribute("placeholder", "검색");
  searchInput.parent(searchWrap);
  searchInput.style("flex", "1");
  searchInput.style("height", "32px");
  searchInput.style("font-size", "16px");
  searchInput.style("border", "none");
  searchInput.style("outline", "none");
  searchInput.style("background", "transparent");
  searchInput.style("color", "#333");
  searchInput.style("font-family", _uiFontFamily());
  searchInput.style("line-height", "32px");

  searchIcon = createDiv("");
  searchIcon.parent(searchWrap);
  searchIcon.style("width", "34px");
  searchIcon.style("height", "34px");
  searchIcon.style("border-radius", "50%");
  searchIcon.style("display", "grid");
  searchIcon.style("place-items", "center");
  searchIcon.style("cursor", "pointer");

  searchIcon.html(`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="rgb(100,150,200)" stroke-width="3"/>
      <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="rgb(100,150,200)" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `);

  searchIcon.mousePressed(() => {
    if (typeof onSearch === "function") onSearch();
  });
}

function _calcExtraBtnMarginLeft() {
  return "calc(6.5vw + min(max(30vw, 320px), 520px) + 10px)";
}

function createExtraButtonDom() {
  extraBtnDom = createDiv("");
  extraBtnDom.style("position", "relative");
  extraBtnDom.style("margin-left", _calcExtraBtnMarginLeft());
  extraBtnDom.style("margin-top", "-46px");
  extraBtnDom.style("margin-bottom", "17px");
  extraBtnDom.style("width", "42px");
  extraBtnDom.style("height", "42px");
  extraBtnDom.style("border-radius", "50%");
  extraBtnDom.style("background", "rgb(20,60,120)");
  extraBtnDom.style("cursor", "pointer");
  extraBtnDom.style("display", "inline-block");

  extraBtnDom.mousePressed(() => {
    if (typeof extractCoreFromFullExtract === "function")
      extractCoreFromFullExtract();
  });
}

function createStatusDom() {
  statusDom = createDiv("");
  statusDom.style("position", "relative");
  statusDom.style("margin-left", "8.0vw");
  statusDom.style("margin-top", "-10px");
  statusDom.style("font-size", "12px");
  statusDom.style("color", "rgba(0,0,0,0.55)");
  statusDom.style("font-family", _uiFontFamily());
}

function createContentDom() {
  contentDiv = createDiv(
    "검색어를 입력하고 돋보기를 눌러 Wikipedia 텍스트를 불러오세요."
  );
  contentDiv.id("wikiContent");
  contentDiv.style("position", "relative");
  contentDiv.style("margin-left", "6vw");
  contentDiv.style("margin-top", "9px");
  contentDiv.style("width", "78vw");
  contentDiv.style("background", "#FFFFFF");
  contentDiv.style("border-radius", "30px");
  contentDiv.style("box-sizing", "border-box");
  contentDiv.style("padding", "28px");
  contentDiv.style("color", "#222");
  contentDiv.style("font-family", _uiFontFamily());
  contentDiv.style("font-size", "18px");
  contentDiv.style("line-height", "1.5");
  contentDiv.style("height", "auto");
  contentDiv.style("max-height", "none");
  contentDiv.style("overflow", "visible");
  contentDiv.style("margin-bottom", "220px");

  summaryP = contentDiv;
}

function renderStatus() {
  if (statusDom) statusDom.html(statusLine || "");
}

/* =========================================================
   ✅ 권한 허용 버튼(통합 1개)
   ========================================================= */

let permissionBtnDom = null;
let _permMode = 0; // 1=MIC, 2=SENSORS, 3=CAMERA(WIPE)
let _followRaf = 0;

function _ensurePermBtnStyleOnce() {
  if (document.getElementById("cs-perm-style")) return;
  const st = document.createElement("style");
  st.id = "cs-perm-style";
  st.textContent = `
    .cs-perm-btn{
      width: 98px;
      height: 42px;
      border-radius: 999px;
      background: rgba(51, 105, 186, 1);
      box-shadow: 0 6px 18px rgba(0,0,0,0.12);
      display: grid;
      place-items: center;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      font-family: Arial, 'Apple SD Gothic Neo', 'Noto Sans KR';
      color: #fff;
      font-size: 12px;
      letter-spacing: 0.2px;
      position: fixed;
      left: 0; top: 0;
      z-index: 9999;
      touch-action: manipulation;
    }
    .cs-perm-btn.is-disabled{
      opacity: 0.55;
      cursor: default;
    }

    

    /* =========================================================
       ✅ 핵심문장 '원문 위치 하이라이트' 스타일
       - cs-sent: 원문 문장 단위 span
       - cs-core: 핵심문장 (검정)
       - cs-hide: 핵심문장 이외 (완전 투명, 자리 유지)
       ========================================================= */
    .cs-sent{ color: rgba(0,0,0,1); }
    .cs-core{ color: rgba(0,0,0,1) !important; }
    .cs-hide{ color: rgba(0,0,0,0) !important; }
  `;
  document.head.appendChild(st);
}

function _getExtraEl() {
  if (window.extraBtnDom && window.extraBtnDom.elt)
    return window.extraBtnDom.elt;
  return null;
}

function _followExtra() {
  cancelAnimationFrame(_followRaf);
  const tick = () => {
    _followRaf = requestAnimationFrame(tick);
    if (!permissionBtnDom || !permissionBtnDom.elt) return;

    const extraEl = _getExtraEl();
    if (!extraEl) return;

    const r = extraEl.getBoundingClientRect();
    const GAP = 14;

    const x = Math.round(r.right + GAP);
    const y = Math.round(r.top + r.height / 2 - 42 / 2);

    permissionBtnDom.elt.style.left = `${x}px`;
    permissionBtnDom.elt.style.top = `${y}px`;
  };
  tick();
}

function _permLabel(mode) {
  if (mode === 1) return "MIC 허용";
  if (mode === 2) return "SENSOR 허용";
  if (mode === 3) return "CAM 허용";
  return "권한 허용";
}

// 권한이 이미 허용되었는지 판단 (각 모듈 상태값을 사용)
function _isAlreadyGranted(mode) {
  if (mode === 1) return !!window.CSMic?.micStarted;
  if (mode === 2) return !!window.CSShake?.sensorsGranted;
  if (mode === 3) return !!window.CSWipe?.started;
  return false;
}

function _syncPermButtonUI() {
  if (!permissionBtnDom || !permissionBtnDom.elt) return;

  const granted = _isAlreadyGranted(_permMode);
  if (_permMode === 0) {
    permissionBtnDom.html("권한 허용");
    permissionBtnDom.elt.classList.add("is-disabled");
    return;
  }

  if (granted) {
    permissionBtnDom.html("READY");
    permissionBtnDom.elt.classList.add("is-disabled");
  } else {
    permissionBtnDom.html(_permLabel(_permMode));
    permissionBtnDom.elt.classList.remove("is-disabled");
  }
}

// 실제 권한 요청/START 트리거
async function _requestPermissionByMode(mode) {
  if (mode === 1) {
    if (!window.CSMic) return;
    if (window.CSMic.micStarted) return;
    window.CSMic.initAudio(); // 내부에서 getUserMedia(오디오) 권한 뜸
    return;
  }

  if (mode === 2) {
    if (!window.CSShake) return;
    if (window.CSShake.sensorsGranted) return;
    await window.CSShake.requestSensors?.();
    return;
  }

  if (mode === 3) {
    if (!window.CSWipe) return;
    if (window.CSWipe.started) return;
    await window.CSWipe.startPose(); // 내부에서 getUserMedia(비디오) 권한 뜸
    return;
  }
}

function createPermissionButtonDom() {
  _ensurePermBtnStyleOnce();

  permissionBtnDom = createDiv("");
  permissionBtnDom.class("cs-perm-btn");
  permissionBtnDom.html("권한 허용");

  // ✅ 다른 효과(물방울 등)가 클릭을 가로채지 못하게 캡처 레벨에서 막기
  const el = permissionBtnDom.elt;
  el.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );
  el.addEventListener(
    "click",
    async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (_permMode === 0) return;

      // 이미 허용되었으면 아무것도 안 함(READY)
      if (_isAlreadyGranted(_permMode)) {
        _syncPermButtonUI();
        return;
      }

      // 권한 요청
      await _requestPermissionByMode(_permMode);

      // UI 업데이트(권한 허용 직후 started/granted가 true로 바뀌면 READY로)
      setTimeout(_syncPermButtonUI, 150);
      setTimeout(_syncPermButtonUI, 600);
    },
    true
  );

  _followExtra();
  _syncPermButtonUI();
}

// 아이콘 클릭 시 이걸 호출해서 “버튼의 역할”만 바꾼다
function setPermissionMode(mode) {
  _permMode = mode || 0;
  _syncPermButtonUI();

  // 상태라인도 같이 바꿔주면 UX가 좋아짐
  if (typeof window.renderStatus === "function") {
    if (_permMode === 1) statusLine = "아이콘1: 마이크 권한 버튼";
    if (_permMode === 2) statusLine = "아이콘2: 센서 권한 버튼";
    if (_permMode === 3) statusLine = "아이콘3: 카메라 권한 버튼";
    renderStatus();
  }
}

function getPermissionButtonElement() {
  return permissionBtnDom?.elt || null;
}

/* ========================================================= */

function initUI() {
  applyBaseBodyStyle();
  createTitleDom();
  createSearchBarDom();
  createExtraButtonDom();

  // ✅ 통합 권한 버튼
  createPermissionButtonDom();

  createStatusDom();
  createContentDom();
  renderStatus();

  // 전역 공개
  window.CSUI = {
    setPermissionMode,
    syncPermissionUI: _syncPermButtonUI,
    getPermissionButtonElement,
  };
}

function updateUILayout() {
  if (extraBtnDom) {
    extraBtnDom.style("margin-left", _calcExtraBtnMarginLeft());
  }
  // permissionBtnDom은 fixed + rAF 추종이라 별도 처리 없음
}
