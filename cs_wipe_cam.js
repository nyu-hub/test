/* cs_wipe_cam.js
   ✅ CSWipe 전용: 카메라 video + 프리뷰 캔버스(미러) + 배지 + 스켈레톤 그리기
   ✅ 외부에서:
      - CSWipeCam.start()  : 카메라 시작 + 프리뷰 생성
      - CSWipeCam.stop()   : 스트림 stop + 프리뷰 제거
      - CSWipeCam.hide()   : 프리뷰만 제거(스트림 유지 옵션)
      - CSWipeCam.draw(pose): 프리뷰 그리기(영상 + skeleton)
      - CSWipeCam.setBadge(text)
*/

(function () {
  const state = {
    // video
    video: null,
    stream: null,

    // preview dom
    wrap: null,
    canvas: null,
    ctx: null,
    mounted: false,

    // size/pos
    W: 180,
    H: 135,
    left: 70,
    top: 12,

    // options
    mirror: true,
  };

  function ensureStyle() {
    if (document.getElementById("cswipe-cam-style")) return;

    const st = document.createElement("style");
    st.id = "cswipe-cam-style";
    st.textContent = `
      .cswipe-preview{
        position: fixed;
        right: 70px;
        top: 12px;
        width: 180px;
        height: 135px;
        border-radius: 14px;
        overflow: hidden;
        background: rgba(0,0,0,0.85);
        box-shadow: 0 12px 26px rgba(0,0,0,0.18);
        z-index: 2147483646;
        pointer-events: none;
      }
      .cswipe-preview canvas{
        width: 100%;
        height: 100%;
        display:block;
      }
      .cswipe-badge{
        position:absolute;
        left:10px;
        top:10px;
        padding:6px 8px;
        border-radius:999px;
        background: rgba(255,255,255,0.18);
        color:#fff;
        font-size:11px;
        letter-spacing:0.2px;
        font-family: Arial, 'Apple SD Gothic Neo', 'Noto Sans KR';
        backdrop-filter: blur(6px);
      }
    `;
    document.head.appendChild(st);
  }

  function ensurePreview() {
    if (state.wrap && document.body.contains(state.wrap)) {
      state.wrap.style.display = "block";
      state.mounted = true;
      return;
    }

    ensureStyle();

    const wrap = document.createElement("div");
    wrap.className = "cswipe-preview";
    wrap.style.right = "12px"; // ✅ 오른쪽 고정
    wrap.style.top = state.top + "px";
    wrap.style.left = "auto"; // ✅ left 무효화

    wrap.style.width = state.W + "px";
    wrap.style.height = state.H + "px";

    const badge = document.createElement("div");
    badge.className = "cswipe-badge";
    badge.textContent = "READY";
    wrap.appendChild(badge);

    const c = document.createElement("canvas");
    c.width = state.W;
    c.height = state.H;
    wrap.appendChild(c);

    document.body.appendChild(wrap);

    state.wrap = wrap;
    state.canvas = c;
    state.ctx = c.getContext("2d");
    state.mounted = true;
  }

  function setBadge(text) {
    if (!state.wrap) return;
    const b = state.wrap.querySelector(".cswipe-badge");
    if (b) b.textContent = text;
  }

  async function start(opts = {}) {
    // opts: { W,H,left,top, mirror }
    if (typeof opts.W === "number") state.W = opts.W;
    if (typeof opts.H === "number") state.H = opts.H;
    if (typeof opts.left === "number") state.left = opts.left;
    if (typeof opts.top === "number") state.top = opts.top;
    if (typeof opts.mirror === "boolean") state.mirror = opts.mirror;

    ensurePreview();
    setBadge("STARTING...");

    if (state.video && state.stream) {
      setBadge("READY");
      return state.video;
    }

    const v = document.createElement("video");
    v.setAttribute("playsinline", "true");
    v.autoplay = true;
    v.muted = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    v.srcObject = stream;
    await v.play();

    state.video = v;
    state.stream = stream;

    setBadge("READY");
    return v;
  }

  function draw(pose /* optional */) {
    if (!state.mounted || !state.ctx || !state.video) return;

    const ctx = state.ctx;
    const W = state.W;
    const H = state.H;

    ctx.clearRect(0, 0, W, H);

    // video
    if (state.mirror) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(state.video, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(state.video, 0, 0, W, H);
    }

    // skeleton
    if (
      pose &&
      window.tmPose &&
      window.tmPose.drawKeypoints &&
      window.tmPose.drawSkeleton
    ) {
      const minPartConfidence = 0.5;
      window.tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
      window.tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
    }
  }

  function hide(removeDom = true) {
    if (!state.wrap) return;
    if (removeDom) {
      try {
        state.wrap.remove();
      } catch (e) {}
      state.wrap = null;
      state.canvas = null;
      state.ctx = null;
      state.mounted = false;
    } else {
      state.wrap.style.display = "none";
      state.mounted = true;
    }
  }

  function stop({ removeDom = true } = {}) {
    // stop tracks
    if (state.stream && state.stream.getTracks) {
      try {
        state.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
    }
    state.stream = null;

    // detach video
    if (state.video) {
      try {
        state.video.pause();
      } catch (e) {}
      try {
        state.video.srcObject = null;
      } catch (e) {}
      try {
        state.video.remove();
      } catch (e) {}
    }
    state.video = null;

    // preview dom
    hide(removeDom);
  }

  function reset() {
    stop({ removeDom: true });
    setBadge("READY");
  }

  function getVideo() {
    return state.video;
  }

  window.CSWipeCam = {
    start,
    draw,
    stop,
    hide,
    reset,
    setBadge,
    ensurePreview,
    getVideo,
  };
})();
