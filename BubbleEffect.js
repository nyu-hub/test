// BubbleEffect.js
class BubbleEffect {
  constructor(count = 12) {
    this.count = count;
    this.bubbles = [];
  }

  init(w, h) {
    this.bubbles = [];
    for (let i = 0; i < this.count; i++) {
      let vx = random(-0.7, 0.7);
      let vy = random(-0.7, 0.7);

      // 너무 느리면 살짝 보정
      if (abs(vx) < 0.2) vx = 0.2 * (vx < 0 ? -1 : 1);
      if (abs(vy) < 0.2) vy = 0.2 * (vy < 0 ? -1 : 1);

      this.bubbles.push({
        x: random(w),
        y: random(h),
        r: random(40, 140),
        alpha: random(40, 90),
        vx,
        vy,
      });
    }
  }

  updateAndDraw(w, h) {
    noStroke();

    for (let b of this.bubbles) {
      // 위치 업데이트
      b.x += b.vx;
      b.y += b.vy;

      // 화면 경계에서 튕기기 (반사)
      const radius = b.r / 2;

      if (b.x - radius < 0) {
        b.x = radius;
        b.vx *= -1;
      } else if (b.x + radius > w) {
        b.x = w - radius;
        b.vx *= -1;
      }

      if (b.y - radius < 0) {
        b.y = radius;
        b.vy *= -1;
      } else if (b.y + radius > h) {
        b.y = h - radius;
        b.vy *= -1;
      }

      // 버블 그리기
      fill(255, 255, 255, b.alpha);
      circle(b.x, b.y, b.r);
    }
  }

  onResize(w, h) {
    for (let b of this.bubbles) {
      const radius = b.r / 2;
      b.x = constrain(b.x, radius, w - radius);
      b.y = constrain(b.y, radius, h - radius);
    }
  }
}
