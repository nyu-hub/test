// SidePanel.js
// ✅ 사이드패널 UI + "쫀득" 스크롤 spring motion만 담당
// ✅ 아이콘 기능은 외부에서 주입(onIconClick) — 여기서는 절대 임의 연결하지 않음
// ✅ (수정) 새로고침 시 사이드바가 커지는 문제 방지:
//    - init 시점에 패널 width/height 즉시 고정
//    - 아이콘 크기를 %가 아니라 px로 계산(부모 미정 상태에서도 안정)
//    - min/max clamp로 폭발 방지

let sidePanelDiv = null;
let sideIcons = [];
let sideOnIconClick = null;

let sideViewH = 0;

// spring state
let sideBaseTop = 0;
let sideCurrentY = 0;
let sideTargetY = 0;

// 튜닝 포인트
let SIDE_STIFFNESS = 0.05;
let SIDE_DAMPING = 0.05;

// 내부 플래그
let _sideStarted = false;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function initSidePanel(opts = {}) {
  sideOnIconClick =
    typeof opts.onIconClick === "function" ? opts.onIconClick : null;

  // 패널 생성
  sidePanelDiv = createDiv("");
  sidePanelDiv.style("position", "absolute");
  sidePanelDiv.style("background", "#FFFFFF");
  sidePanelDiv.style("border-radius", "30px");
  sidePanelDiv.style("box-sizing", "border-box");
  sidePanelDiv.style("z-index", "10");
  sidePanelDiv.style("display", "flex");
  sidePanelDiv.style("flex-direction", "column");
  sidePanelDiv.style("justify-content", "space-around");
  sidePanelDiv.style("align-items", "center");
  sidePanelDiv.style("padding", "18px 0");
  sidePanelDiv.style("will-change", "transform");
  sidePanelDiv.style("transition", "none");

  // ✅ 새로고침 순간(아이콘 로드 전)에도 폭발 안 하게: 먼저 패널 사이즈를 '즉시' 고정
  //    (updateSidePanelLayout에서도 다시 계산해줌)
  const tmpW = clamp(windowWidth * 0.08, 72, 140);
  const tmpH = clamp(windowHeight * 0.6, 280, 520);
  sidePanelDiv.style("width", tmpW + "px");
  sidePanelDiv.style("height", tmpH + "px");
  sidePanelDiv.style("left", windowWidth - tmpW - windowWidth * 0.06 + "px");
  sidePanelDiv.style("top", windowHeight * 0.3 + "px");

  // 아이콘 4개 생성
  for (let i = 1; i <= 4; i++) {
    const icon = createImg(`icon${i}.png`, `icon${i}`);
    icon.parent(sidePanelDiv);

    // ✅ % 금지: 초기 부모 폭이 불안정할 때 커지는 원인
    icon.style("width", "52px");
    icon.style("height", "auto");
    icon.style("cursor", "pointer");
    icon.style("user-select", "none");
    icon.style("-webkit-user-drag", "none");
    icon.elt.draggable = false;

    icon.mousePressed(() => {
      if (sideOnIconClick) sideOnIconClick(i);
    });

    sideIcons.push(icon);
  }

  // 스크롤 이벤트: target만 갱신
  window.addEventListener("scroll", _updateSidePanelTarget, { passive: true });

  // ✅ 생성 직후 1회 레이아웃 확정(새로고침 튐 방지)
  updateSidePanelLayout(windowHeight);
}

function updateSidePanelLayout(viewH) {
  if (!sidePanelDiv) return;

  sideViewH = viewH || windowHeight;

  // ✅ 폭/높이 clamp (너무 작아지거나 커지는 것 방지)
  const sideW = clamp(windowWidth * 0.08, 72, 140);
  const sideH = clamp(sideViewH * 0.6, 280, 520);

  const sideX = windowWidth - sideW - windowWidth * 0.06;
  const sideY = sideViewH * 0.3;

  sidePanelDiv.style("width", sideW + "px");
  sidePanelDiv.style("height", sideH + "px");
  sidePanelDiv.style("left", sideX + "px");

  sideBaseTop = sideY;
  sidePanelDiv.style("top", sideBaseTop + "px");

  // ✅ 아이콘 크기도 패널 폭 기준으로 px로 계산
  const iconPx = clamp(sideW * 0.56, 44, 78);
  for (const icon of sideIcons) {
    icon.style("width", iconPx + "px");
  }

  // 최초 세팅 (깜빡임 방지)
  if (sideCurrentY === 0) {
    sideCurrentY = window.scrollY;
    sideTargetY = window.scrollY;
    sidePanelDiv.elt.style.transform = `translateY(${sideCurrentY}px)`;
  }
}

function setSidePanelMotionParams({ stiffness, damping } = {}) {
  if (typeof stiffness === "number") SIDE_STIFFNESS = stiffness;
  if (typeof damping === "number") SIDE_DAMPING = damping;
}

function startSidePanelMotion() {
  if (_sideStarted) return;
  _sideStarted = true;

  _updateSidePanelTarget();
  _animateSidePanel();
}

function _updateSidePanelTarget() {
  sideTargetY = window.scrollY;
}

function _animateSidePanel() {
  if (!sidePanelDiv) {
    requestAnimationFrame(_animateSidePanel);
    return;
  }

  if (!_animateSidePanel.v) _animateSidePanel.v = 0;

  const diff = sideTargetY - sideCurrentY;
  _animateSidePanel.v =
    _animateSidePanel.v * SIDE_DAMPING + diff * SIDE_STIFFNESS;
  sideCurrentY += _animateSidePanel.v;

  sidePanelDiv.elt.style.transform = `translateY(${sideCurrentY}px)`;

  requestAnimationFrame(_animateSidePanel);
}
