// sketch.js
// ✅ 캔버스는 배경만 (fixed)
// ✅ 타이틀/검색바/input/버튼/본문은 uiLayout.js에서 HTML로 생성
// ✅ 흰 큰 상자는 문서 흐름으로 내려오게 해서 겹침 제거
// ✅ 사이드패널은 SidePanel.js에서만 관리

// ----------------------------
// 기능 스크립트들이 기대하는 전역 상태
// ----------------------------
let keyword = "토끼";
let language = "ko"; // KO 고정
let summaryP;
let fullExtract = "";
let currentTitle = "";

// ----------------------------
// UI 상태 (HTML) — uiLayout.js가 생성
// ----------------------------
let titleDom;
let searchWrap;
let searchIcon;
let searchInput;
let extraBtnDom;

let contentDiv;
let statusLine = "";
let statusDom;

// ----------------------------
let viewH;
let cnv; // ✅ 캔버스 핸들 (배경용 fixed 처리)
let bubbleFX; // ✅ BubbleEffect

// ----------------------------
// ✅ 아이콘 전환 중첩 방지용
// ----------------------------
let activeIcon = 0; // 0: none, 1~4

// ✅ 곤색 원형 버튼(핵심문장) '원문 위치 하이라이트' 모드
let coreViewActive = false;

function _coreKey(s) {
  // 핵심문장 리스트(정규화된 결과)와 원문 span을 최대한 같은 방식으로 맞추기
  try {
    let t = String(s || "").trim();
    // sentenceCore.js의 정리 파이프라인을 가능하면 같이 사용
    if (typeof removeLeadingConnector === "function")
      t = removeLeadingConnector(t);
    if (typeof normalizeEnding === "function") t = normalizeEnding(t);

    return t
      .replace(/\s+/g, " ")
      .replace(/[“”"']/g, "")
      .replace(/[()\[\]{}]/g, "")
      .trim();
  } catch (e) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function clearCoreHighlight() {
  const root = document.getElementById("wikiContent");
  if (!root) return;
  const spans = root.querySelectorAll(".cs-sent");
  spans.forEach((sp) => {
    sp.classList.remove("cs-core");
    sp.classList.remove("cs-hide");
  });
}

function showCoreInOriginalPositions(topSentences) {
  const root = document.getElementById("wikiContent");
  if (!root) return;

  const coreSet = new Set((topSentences || []).map(_coreKey));

  const spans = root.querySelectorAll(".cs-sent");
  spans.forEach((sp) => {
    const raw = sp.textContent || "";
    const key = _coreKey(raw);
    const isCore = coreSet.has(key);

    sp.classList.toggle("cs-core", isCore);
    sp.classList.toggle("cs-hide", !isCore);
  });
}

// ✅ 본문 “기준 상태” 스냅샷 저장/복구 (효과 리셋 핵심)
window.CSBase = {
  html: "",
  sig: "",
  captureBase() {
    const el = document.getElementById("wikiContent");
    if (!el) return;
    this.html = el.innerHTML;
    this.sig =
      String(el.childNodes.length) + ":" + String(el.textContent || "").length;
  },
  restoreBase() {
    const el = document.getElementById("wikiContent");
    if (!el) return;
    if (this.html) el.innerHTML = this.html;
  },
};

// ✅ 모든 효과를 “깔끔하게” 정리하고 본문을 기준 상태로 복구
function resetAllEffects() {
  // 1) 모듈 OFF
  window.CSMic?.setEnabled?.(false);
  window.CSShake?.setEnabled?.(false);
  window.CSWipe?.setEnabled?.(false);
  window.CSWater?.setEnabled?.(false);

  // 2) 모듈 내부 흔적 정리(오버레이/particles/physics/state)
  window.CSMic?.reset?.();
  window.CSShake?.reset?.();
  window.CSWipe?.reset?.();
  window.CSWater?.reset?.();

  // 3) 본문 DOM을 기준 상태로 완전 복구
  window.CSBase?.restoreBase();

  // 4) 권한 버튼 UI 텍스트/상태 재동기화
  window.CSUI?.syncPermissionUI?.();
}

// ----------------------------
function setup() {
  viewH = windowHeight;

  // ✅ 1) 배경 캔버스(버블/색)만 고정
  cnv = createCanvas(windowWidth, viewH);
  cnv.position(0, 0);
  cnv.style("position", "fixed");
  cnv.style("left", "0");
  cnv.style("top", "0");
  cnv.style("z-index", "-10");
  cnv.style("pointer-events", "none");

  // ✅ 버블 초기화
  bubbleFX = new BubbleEffect(12);
  bubbleFX.init(windowWidth, viewH);

  // ✅ 2) HTML UI는 uiLayout.js에서
  initUI();

  // ✅ 3) 사이드패널 초기화 (SidePanel.js)
  initSidePanel({
    onIconClick: async (index) => {
      // ✅ 핵심문장 하이라이트 모드에서는 어떤 아이콘 효과도 적용하지 않음
      if (coreViewActive) {
        resetAllEffects();
        activeIcon = 0;
        window.CSUI?.setPermissionMode?.(0);
        window.CSUI?.syncPermissionUI?.();
        statusLine = "핵심 문장 보기 중 — 아이콘 효과는 적용되지 않아요";
        renderStatus();
        return;
      }

      // ✅ 같은 아이콘을 다시 누르면: “전부 리셋하고 OFF”
      if (activeIcon === index) {
        resetAllEffects();
        activeIcon = 0;
        statusLine = "효과 OFF";
        renderStatus();
        return;
      }

      // ✅ 다른 아이콘 누르면: 이전 효과 완전 정리 → (권한 OK면) 딱 하나만 ON
      resetAllEffects();

      // ✅ 권한 버튼 모드 동기화 (아이콘 1~3만)
      if (index === 1 || index === 2 || index === 3) {
        window.CSUI?.setPermissionMode?.(index);
        window.CSUI?.syncPermissionUI?.();
      }

      // ----------------------------
      // 아이콘별 ON 로직 (중첩 불가)
      // ----------------------------
      if (index === 1) {
        // MIC
        if (!window.CSMic?.micStarted) {
          activeIcon = 0;
          statusLine = "🎤 마이크 권한 필요 → ‘MIC 허용’ 버튼을 먼저 눌러줘";
          renderStatus();
          return;
        }
        window.CSMic?.setEnabled?.(true);
        activeIcon = 1;
        statusLine = "🎤 MIC ON";
        renderStatus();
        return;
      }

      if (index === 2) {
        // SHAKE
        if (!window.CSShake?.sensorsGranted) {
          activeIcon = 0;
          statusLine = "🫨 센서 권한 필요 → ‘SENSOR 허용’ 버튼을 먼저 눌러줘";
          renderStatus();
          return;
        }
        window.CSShake?.setEnabled?.(true);
        activeIcon = 2;
        statusLine = "🫨 SHAKE ON";
        renderStatus();
        return;
      }

      if (index === 3) {
        // WIPE
        if (!window.CSWipe?.started) {
          activeIcon = 0;
          statusLine = "🫧 카메라 권한 필요 → ‘CAM 허용’ 버튼을 먼저 눌러줘";
          renderStatus();
          return;
        }
        window.CSWipe?.setEnabled?.(true);
        activeIcon = 3;
        statusLine = "🫧 WIPE ON";
        renderStatus();
        return;
      }

      if (index === 4) {
        // WATER (권한 없이 바로 ON)
        window.CSWater?.setEnabled?.(true);
        activeIcon = 4;
        statusLine = "💧 물방울 모드 ON";
        renderStatus();
        return;
      }
    },
  });
}

// ----------------------------
function draw() {
  background(175, 215, 255);
  if (bubbleFX) bubbleFX.updateAndDraw(width, viewH);

  // ✅ 아이콘4 물방울 오버레이
  if (window.CSWater) window.CSWater.updateAndDraw();
}

// ----------------------------
// 아이콘 2(핵심문장) 로직 (extraBtnDom에서 호출)
// ----------------------------
function extractCoreFromFullExtract() {
  if (!fullExtract) {
    statusLine = "먼저 검색(돋보기)으로 텍스트를 불러오세요.";
    summaryP.html("먼저 검색(돋보기)으로 텍스트를 불러오세요.");
    renderStatus();
    return;
  }

  // ✅ 토글: 한 번 더 누르면 원문 전체로 복귀
  if (coreViewActive) {
    coreViewActive = false;
    clearCoreHighlight();
    statusLine = "원문 보기";
    renderStatus();
    // 기준 본문을 원문 상태로 다시 저장 (이후 효과 리셋이 원문으로 돌아가게)
    window.CSBase?.captureBase();
    return;
  }

  // ✅ 핵심문장 모드 진입: 효과 전부 OFF + 아이콘 차단
  coreViewActive = true;
  resetAllEffects();
  activeIcon = 0;
  window.CSUI?.setPermissionMode?.(0);
  window.CSUI?.syncPermissionUI?.();

  const topSentences = pickTopSentences(fullExtract, 6);

  if (topSentences.length === 0) {
    statusLine = `${
      currentTitle || keyword
    } 문서에서 핵심 문장을 뽑지 못했습니다.`;
    renderStatus();
    return;
  }

  // ✅ 원문 위치 그대로: 핵심문장만 검정, 나머지는 완전 투명
  showCoreInOriginalPositions(topSentences);
  statusLine = `핵심 문장 보기: ${currentTitle || keyword}`;
  renderStatus();

  // ✅ 핵심 하이라이트 상태도 기준으로 저장 (효과 리셋 시 이 화면 유지)
  window.CSBase?.captureBase();
}

// ----------------------------
function keyPressed() {
  if (keyCode === ENTER) onSearch();
}

// ----------------------------
// 검색 실행 (wikiApi.js 이용)
function onSearch() {
  keyword = (searchInput?.value() || "").trim();

  if (!keyword) {
    statusLine = "검색어를 입력해주세요.";
    summaryP.html("검색어를 입력해주세요.");
    renderStatus();
    return;
  }

  // ✅ 새 문서 검색 = 핵심문장 모드 해제
  coreViewActive = false;

  // 검색할 때는 효과 모두 OFF + 본문 기준도 새로 갱신되는 흐름이 깔끔함
  resetAllEffects();
  activeIcon = 0;

  language = "ko";
  const url = buildWikiUrl(keyword, language);

  statusLine = `Wikipedia 불러오는 중… (${keyword})`;
  summaryP.html("Wikipedia에서 데이터 불러오는 중…");
  fullExtract = "";
  currentTitle = "";
  renderStatus();

  loadJSON(
    url,
    (data) => {
      handleWikiData(data, language);

      // 새 원문이 들어오면 혹시 남아있던 하이라이트 클래스 제거
      clearCoreHighlight();

      // ✅ DOM 반영 타이밍 안정화: 한 틱 뒤에 기준 본문 저장
      setTimeout(() => window.CSBase?.captureBase(), 0);

      statusLine = `불러오기 완료: ${currentTitle || keyword}`;
      renderStatus();
    },
    (err) => {
      handleWikiError(err);
      statusLine = "에러: Wikipedia 데이터를 불러오지 못했습니다.";
      renderStatus();
    }
  );
}

// ----------------------------
function windowResized() {
  viewH = windowHeight;
  resizeCanvas(windowWidth, viewH);

  if (bubbleFX) bubbleFX.onResize(windowWidth, viewH);

  // ✅ UI 레이아웃 갱신 (필요한 것만)
  updateUILayout();

  // ✅ sidePanel은 기존대로 갱신 필요
  updateSidePanelLayout(viewH);

  // ✅ 기준 본문이 이미 있다면, 리사이즈 후에도 그대로 유지
  // (필요 시 captureBase를 다시 하고 싶으면 아래 주석 해제)
  // setTimeout(() => window.CSBase?.captureBase(), 0);
}
