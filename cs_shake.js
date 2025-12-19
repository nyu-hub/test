/* cs_shake.js (SIMPLE)
   - Phone: devicemotion magnitude로 흔들림 감지 → 색 변경
   - Desktop: mousemove 누적 이동량 → 색 변경
   - Public API: window.CSShake.setEnabled / toggle 유지
*/

(function () {
  const CFG = {
    DEV_THRESHOLD: 18, // 흔들림 임계 (필요하면 14~25로 조절)
    MOUSE_THRESHOLD: 220, // 마우스 이동 누적 임계
    DECAY: 0.85, // 마우스 누적 감쇠
    SAT: 70,
    LIT: 85,
  };

  const state = {
    enabled: false,
    sensorsGranted: false,
    hue: 200,
    mouseEnergy: 0,
    lastX: 0,
    lastY: 0,
    hasLastMouse: false,
    prevBg: "",
    hadPrevBg: false,
  };

  function setBgHue(h) {
    const hh = ((h % 360) + 360) % 360;
    document.body.style.background = `hsl(${hh} ${CFG.SAT}% ${CFG.LIT}%)`;
  }

  function bumpColor(amount = 35) {
    state.hue += amount + Math.random() * 18;
    setBgHue(state.hue);
  }

  async function requestSensorsOnce() {
    if (state.sensorsGranted) return true;
    try {
      // iOS는 사용자 제스처 안에서만 허용됨(아이콘 클릭/toggle 등에서 실행될 수 있음)
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        const res = await DeviceMotionEvent.requestPermission();
        state.sensorsGranted = res === "granted";
      } else {
        state.sensorsGranted = true;
      }
    } catch (e) {
      state.sensorsGranted = false;
    }
    return state.sensorsGranted;
  }

  function onDeviceMotion(e) {
    if (!state.enabled) return;
    if (!state.sensorsGranted) return;

    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;

    const ax = a.x || 0,
      ay = a.y || 0,
      az = a.z || 0;
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);

    if (mag > CFG.DEV_THRESHOLD) bumpColor(55);
  }

  function onMouseMove(e) {
    if (!state.enabled) return;

    if (!state.hasLastMouse) {
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.hasLastMouse = true;
      return;
    }

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    const impulse = Math.abs(dx) + Math.abs(dy);
    state.mouseEnergy = state.mouseEnergy * CFG.DECAY + impulse;

    if (state.mouseEnergy > CFG.MOUSE_THRESHOLD) {
      state.mouseEnergy = 0;
      bumpColor(35);
    }
  }

  function bind() {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("devicemotion", onDeviceMotion, { passive: true });
  }

  function unbind() {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("devicemotion", onDeviceMotion);
  }

  async function setEnabled(v) {
    const next = !!v;
    if (next === state.enabled) return;
    state.enabled = next;

    if (state.enabled) {
      if (!state.hadPrevBg) {
        state.prevBg = document.body.style.background || "";
        state.hadPrevBg = true;
      }
      // 센서 권한은 가능하면 켤 때 한번 요청
      await requestSensorsOnce();
      bind();
    } else {
      unbind();
      state.mouseEnergy = 0;
      state.hasLastMouse = false;
      // 원래 배경 복구
      if (state.hadPrevBg) document.body.style.background = state.prevBg;
    }
  }

  function toggle() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  window.CSShake = {
    setEnabled,
    toggle,
    get enabled() {
      return state.enabled;
    },
  };
})();
