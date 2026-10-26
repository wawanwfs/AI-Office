import { describe, it, expect } from 'vitest';
import {
  computeAspect,
  isPortraitViewport,
  getResponsiveFov,
  getResponsiveRadius,
  getViewOffsetConfig,
  getCanvasPointerNdc,
  getMaxBubbles,
  BASE_FOV_DESKTOP,
  BASE_FOV_TABLET_PORTRAIT,
  BASE_FOV_MOBILE_PORTRAIT,
  BASE_RADIUS_DESKTOP,
  BASE_RADIUS_TABLET_PORTRAIT,
  BASE_RADIUS_MOBILE_PORTRAIT,
} from '../scene/parts/viewport_spec.js';

describe('viewport_spec', () => {
  describe('computeAspect', () => {
    it('menghitung rasio aspek lebar / tinggi dengan benar', () => {
      expect(computeAspect(1920, 1080)).toBeCloseTo(1.7778, 3);
      expect(computeAspect(1366, 768)).toBeCloseTo(1.7786, 3);
      expect(computeAspect(600, 800)).toBeCloseTo(0.75, 2);
    });

    it('tahan terhadap nilai 0, negatif, dan string/null (bebas NaN / pembagian 0)', () => {
      expect(computeAspect(0, 0)).toBe(1);
      expect(computeAspect(800, 0)).toBe(800);
      expect(computeAspect(null, undefined)).toBe(1);
      expect(computeAspect(-100, 500)).toBeCloseTo(1 / 500, 4);
    });
  });

  describe('isPortraitViewport', () => {
    it('mengidentifikasi portrait ketika aspek < 0.8', () => {
      expect(isPortraitViewport(0.56)).toBe(true);
      expect(isPortraitViewport(0.75)).toBe(true);
      expect(isPortraitViewport(0.799)).toBe(true);
    });

    it('mengidentifikasi landscape ketika aspek >= 0.8', () => {
      expect(isPortraitViewport(0.80)).toBe(false);
      expect(isPortraitViewport(1.0)).toBe(false);
      expect(isPortraitViewport(1.77)).toBe(false);
    });
  });

  describe('getResponsiveFov', () => {
    it('mengembalikan FOV mobile portrait (68°) untuk rasio < 0.6', () => {
      expect(getResponsiveFov(0.55)).toBe(BASE_FOV_MOBILE_PORTRAIT);
      expect(getResponsiveFov(0.40)).toBe(68);
    });

    it('mengembalikan FOV tablet portrait (56°) untuk rasio antara 0.6 dan 0.8', () => {
      expect(getResponsiveFov(0.60)).toBe(BASE_FOV_TABLET_PORTRAIT);
      expect(getResponsiveFov(0.75)).toBe(56);
    });

    it('mengembalikan FOV desktop baku (54°) untuk rasio >= 0.8', () => {
      expect(getResponsiveFov(0.80)).toBe(BASE_FOV_DESKTOP);
      expect(getResponsiveFov(1.33)).toBe(54);
      expect(getResponsiveFov(1.77)).toBe(54);
    });
  });

  describe('getResponsiveRadius', () => {
    it('mempertahankan savedRadius bila telah ditentukan pengguna', () => {
      expect(getResponsiveRadius(0.5, 48)).toBe(48);
      expect(getResponsiveRadius(1.77, 28)).toBe(28);
    });

    it('mempertahankan homeRadius bila disediakan', () => {
      expect(getResponsiveRadius(0.5, null, 38)).toBe(38);
    });

    it('menggunakan radius mobile 34 untuk rasio < 0.6', () => {
      expect(getResponsiveRadius(0.55)).toBe(BASE_RADIUS_MOBILE_PORTRAIT);
    });

    it('menggunakan radius tablet 36 untuk rasio < 0.8', () => {
      expect(getResponsiveRadius(0.72)).toBe(BASE_RADIUS_TABLET_PORTRAIT);
    });

    it('meng-clamp radius desktop ke batas aman maks 56', () => {
      expect(getResponsiveRadius(1.77, null, null, 42.5)).toBe(BASE_RADIUS_DESKTOP);
      expect(getResponsiveRadius(1.77, null, null, 70)).toBe(56);
    });
  });

  describe('getViewOffsetConfig', () => {
    it('mengaktifkan offset horizontal (-w * 0.045) untuk viewport ultra-sempit (< 0.6)', () => {
      const cfg = getViewOffsetConfig(400, 800); // asp = 0.5 < 0.6
      expect(cfg.enabled).toBe(true);
      expect(cfg.offsetX).toBeCloseTo(-400 * 0.045);
      expect(cfg.fullWidth).toBe(400);
      expect(cfg.fullHeight).toBe(800);
    });

    it('menonaktifkan view offset untuk viewport normal / split lebar (>= 0.6)', () => {
      const cfg = getViewOffsetConfig(800, 600); // asp = 1.33
      expect(cfg.enabled).toBe(false);
      expect(cfg.offsetX).toBe(0);
    });
  });

  describe('getCanvasPointerNdc', () => {
    it('menghitung NDC tepat pada kanvas layar penuh', () => {
      const dom = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
      };
      // Titik tengah kanvas -> NDC (0, 0)
      expect(getCanvasPointerNdc({ clientX: 500, clientY: 250 }, dom)).toEqual({ x: 0, y: 0 });
      // Pojok kiri-atas -> NDC (-1, 1)
      expect(getCanvasPointerNdc({ clientX: 0, clientY: 0 }, dom)).toEqual({ x: -1, y: 1 });
      // Pojok kanan-bawah -> NDC (1, -1)
      expect(getCanvasPointerNdc({ clientX: 1000, clientY: 500 }, dom)).toEqual({ x: 1, y: -1 });
    });

    it('menghitung NDC presisi saat kanvas berada di mode layar split (tergeser secara horizontal)', () => {
      // Misal split window: kanvas berada di paruh kanan layar (left: 600, width: 600, top: 0, height: 800)
      const dom = {
        getBoundingClientRect: () => ({ left: 600, top: 0, width: 600, height: 800 }),
      };
      // Tepi kiri kanvas split (clientX: 600) harus bernilai NDC x = -1
      expect(getCanvasPointerNdc({ clientX: 600, clientY: 400 }, dom).x).toBeCloseTo(-1);
      // Tengah kanvas split (clientX: 900) harus bernilai NDC x = 0
      expect(getCanvasPointerNdc({ clientX: 900, clientY: 400 }, dom).x).toBeCloseTo(0);
      // Tepi kanan kanvas split (clientX: 1200) harus bernilai NDC x = 1
      expect(getCanvasPointerNdc({ clientX: 1200, clientY: 400 }, dom).x).toBeCloseTo(1);
    });

    it('menghitung NDC presisi saat kanvas tergeser secara vertikal (header/toolbar offset)', () => {
      // Kanvas ber-offset top 100px, tinggi 500px
      const dom = {
        getBoundingClientRect: () => ({ left: 0, top: 100, width: 800, height: 500 }),
      };
      // Tepi atas kanvas (clientY: 100) -> NDC y = 1
      expect(getCanvasPointerNdc({ clientX: 400, clientY: 100 }, dom).y).toBeCloseTo(1);
      // Tengah kanvas (clientY: 350) -> NDC y = 0
      expect(getCanvasPointerNdc({ clientX: 400, clientY: 350 }, dom).y).toBeCloseTo(0);
      // Tepi bawah kanvas (clientY: 600) -> NDC y = -1
      expect(getCanvasPointerNdc({ clientX: 400, clientY: 600 }, dom).y).toBeCloseTo(-1);
    });

    it('fallback anggun saat domElement atau getBoundingClientRect null/tidak tersedia', () => {
      expect(getCanvasPointerNdc(null, null)).toEqual({ x: 0, y: 0 });
      const res = getCanvasPointerNdc({ clientX: 100, clientY: 100 }, null);
      expect(typeof res.x).toBe('number');
      expect(typeof res.y).toBe('number');
    });
  });

  describe('getMaxBubbles', () => {
    it('mengembalikan 2 bubble untuk lebar layar sempit (< 760px)', () => {
      expect(getMaxBubbles(750)).toBe(2);
      expect(getMaxBubbles(480)).toBe(2);
      expect(getMaxBubbles(360)).toBe(2);
    });

    it('mengembalikan 3 bubble untuk lebar layar normal/luas (>= 760px)', () => {
      expect(getMaxBubbles(760)).toBe(3);
      expect(getMaxBubbles(1024)).toBe(3);
      expect(getMaxBubbles(1920)).toBe(3);
    });

    it('fallback ke 3 bila lebar tidak valid atau 0', () => {
      expect(getMaxBubbles(0)).toBe(3);
      expect(getMaxBubbles(null)).toBe(3);
    });
  });

  describe('multi-window & split-screen simulation', () => {
    it('mengadaptasi FOV dan radius saat beralih dari layar penuh ke mode split-screen 50%', () => {
      // 1. Awalnya layar penuh desktop (1920x1080)
      const fullW = 1920, fullH = 1080;
      const fullAsp = computeAspect(fullW, fullH);
      expect(isPortraitViewport(fullAsp)).toBe(false);
      expect(getResponsiveFov(fullAsp)).toBe(54);
      expect(getResponsiveRadius(fullAsp)).toBe(42.5);

      // 2. User membagi layar menjadi split 50% (960x1080 -> asp = 0.888)
      const splitW = 960, splitH = 1080;
      const splitAsp = computeAspect(splitW, splitH);
      expect(isPortraitViewport(splitAsp)).toBe(false);
      expect(getResponsiveFov(splitAsp)).toBe(54);

      // 3. User menyempitkan jendela menjadi 1/3 layar atau split sempit (600x1000 -> asp = 0.6)
      const narrowW = 600, narrowH = 1000;
      const narrowAsp = computeAspect(narrowW, narrowH);
      expect(isPortraitViewport(narrowAsp)).toBe(true);
      expect(getResponsiveFov(narrowAsp)).toBe(56);
      expect(getResponsiveRadius(narrowAsp)).toBe(36);

      // 4. Split sangat sempit / mode mobile (400x900 -> asp = 0.444)
      const ultraNarrowW = 400, ultraNarrowH = 900;
      const ultraAsp = computeAspect(ultraNarrowW, ultraNarrowH);
      expect(isPortraitViewport(ultraAsp)).toBe(true);
      expect(getResponsiveFov(ultraAsp)).toBe(68);
      expect(getResponsiveRadius(ultraAsp)).toBe(34);
    });

    it('memastikan NDC pointer akurat pada layar terbelah dua (kiri vs kanan)', () => {
      // Layar total 1920x1080, jendela split di paruh kanan: left: 960, width: 960, top: 0, height: 1080
      const rightSplitCanvas = {
        getBoundingClientRect: () => ({ left: 960, top: 0, width: 960, height: 1080 }),
      };

      // Klik tepat di tengah jendela split (clientX: 960 + 480 = 1440, clientY: 540)
      const ndcCenter = getCanvasPointerNdc({ clientX: 1440, clientY: 540 }, rightSplitCanvas);
      expect(ndcCenter.x).toBeCloseTo(0);
      expect(ndcCenter.y).toBeCloseTo(0);

      // Klik di batas kiri jendela split (clientX: 960)
      const ndcLeft = getCanvasPointerNdc({ clientX: 960, clientY: 540 }, rightSplitCanvas);
      expect(ndcLeft.x).toBeCloseTo(-1);

      // Klik di batas kanan jendela split (clientX: 1920)
      const ndcRight = getCanvasPointerNdc({ clientX: 1920, clientY: 540 }, rightSplitCanvas);
      expect(ndcRight.x).toBeCloseTo(1);
    });
  });
});
