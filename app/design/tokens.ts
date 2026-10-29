/**
 * dbg project — Design Tokens v1.0.0
 * ------------------------------------------------------------------
 * Single source of truth untuk style guide dbg project.
 * Struktur file ini 1:1 dengan file Figma "dbg project — UI Kit"
 * (halaman: Foundations → Color / Typography / Spacing / Components,
 * lalu 5 mockup: Landing-Login, Dashboard, Detail, Form Input, Mobile).
 *
 * Konsumsi:
 *   import { color, typography, spacing, button } from '@/app/design/tokens';
 * ------------------------------------------------------------------
 */

/* ============================================================
 * 1. COLOR — Palet warna
 * ============================================================ */

export const color = {
  /** Brand — Deep Teal: primary action, link, identitas */
  brand: {
    50: '#EFFAF7',
    100: '#D7F2EA',
    200: '#AEE5D6',
    300: '#7DD1BC',
    400: '#4AB79E',
    500: '#2A9C85',
    600: '#1E7D6B',
    700: '#196456',
    800: '#155045',
    900: '#123E37',
  },
  /** Accent — Amber: highlight, badge, angka penting di dashboard */
  accent: {
    400: '#F5B93F',
    500: '#E89B1C',
    600: '#C67C0E',
  },
  /** Neutral — warm gray */
  neutral: {
    0: '#FFFFFF',
    50: '#FAFAF8',
    100: '#F4F4F1',
    200: '#E7E7E2',
    300: '#D3D3CC',
    400: '#A3A39A',
    500: '#73736B',
    600: '#52524C',
    700: '#3B3B36',
    800: '#272723',
    900: '#171714',
  },
  /** Semantic status */
  semantic: {
    success: { base: '#1E7D6B', bg: '#EFFAF7', text: '#155045' },
    warning: { base: '#C67C0E', bg: '#FDF4E3', text: '#8A5608' },
    danger: { base: '#C0392B', bg: '#FDECEA', text: '#96271B' },
    info: { base: '#2A6F9E', bg: '#EAF3FA', text: '#1D527A' },
  },
  /** Surface (background layer) */
  surface: {
    page: '#FAFAF8',
    card: '#FFFFFF',
    raised: '#FFFFFF',
    subtle: '#F4F4F1',
    inverse: '#171714',
  },
  /** Text */
  text: {
    primary: '#171714',
    secondary: '#52524C',
    muted: '#73736B',
    disabled: '#A3A39A',
    inverse: '#FAFAF8',
    brand: '#1E7D6B',
    onBrand: '#FFFFFF',
  },
  /** Border */
  border: {
    subtle: '#E7E7E2',
    default: '#D3D3CC',
    strong: '#A3A39A',
    focus: '#2A9C85',
  },
} as const;

/* ============================================================
 * 2. TYPOGRAPHY
 * ============================================================ */

export const fontFamily = {
  display: "'Sora', 'Segoe UI', sans-serif",
  body: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'Consolas', monospace",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

/** Nama key = nama Text Style di Figma */
export const typography: Record<string, TextStyle> = {
  'display-xl': { fontFamily: fontFamily.display, fontSize: 56, lineHeight: 60, fontWeight: 700, letterSpacing: -1.5 },
  display: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 48, fontWeight: 700, letterSpacing: -1 },
  h1: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 40, fontWeight: 600, letterSpacing: -0.5 },
  h2: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 32, fontWeight: 600 },
  h3: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 28, fontWeight: 600 },
  'body-lg': { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24, fontWeight: 400 },
  body: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20, fontWeight: 400 },
  'body-strong': { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20, fontWeight: 600 },
  'body-sm': { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, fontWeight: 400 },
  caption: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16, fontWeight: 400 },
  overline: { fontFamily: fontFamily.body, fontSize: 11, lineHeight: 16, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' },
  'mono-sm': { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, fontWeight: 400 },
};

/* ============================================================
 * 3. SPACING — base 4px
 * ============================================================ */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

/* ============================================================
 * 4. RADIUS / SHADOW / MOTION / Z-INDEX
 * ============================================================ */

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const shadow = {
  xs: '0 1px 2px rgba(23, 23, 20, 0.05)',
  sm: '0 2px 4px rgba(23, 23, 20, 0.06), 0 1px 2px rgba(23, 23, 20, 0.04)',
  md: '0 8px 16px rgba(23, 23, 20, 0.08), 0 2px 4px rgba(23, 23, 20, 0.04)',
  lg: '0 16px 32px rgba(23, 23, 20, 0.12), 0 4px 8px rgba(23, 23, 20, 0.06)',
} as const;

export const motion = {
  duration: { instant: 100, fast: 150, normal: 200, slow: 300 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  toast: 1400,
} as const;

/* ============================================================
 * 5. LAYOUT — grid, breakpoint, container
 * ============================================================ */

export const breakpoint = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export const container = {
  maxWidth: 1200,
  gutter: 24,
  columns: { desktop: 12, tablet: 8, mobile: 4 },
} as const;

export const layout = {
  sidebarWidth: 256,
  sidebarWidthCollapsed: 72,
  topbarHeight: 64,
  contentPadding: 32,
  mobilePadding: 16,
} as const;

/* ============================================================
 * 6. COMPONENT TOKENS
 * ============================================================ */

/** Button — varian: primary / secondary / ghost / danger */
export const button = {
  radius: radius.md,
  size: {
    sm: { height: 32, paddingX: 12, font: typography['body-sm'], icon: 16, gap: 6 },
    md: { height: 40, paddingX: 16, font: typography['body-strong'], icon: 18, gap: 8 },
    lg: { height: 48, paddingX: 24, font: typography['body-lg'], icon: 20, gap: 10 },
  },
  variant: {
    primary: { bg: color.brand[600], bgHover: color.brand[700], bgPressed: color.brand[800], text: color.text.onBrand, border: 'transparent' },
    secondary: { bg: color.neutral[0], bgHover: color.neutral[100], bgPressed: color.neutral[200], text: color.text.primary, border: color.border.default },
    ghost: { bg: 'transparent', bgHover: color.neutral[100], bgPressed: color.neutral[200], text: color.text.brand, border: 'transparent' },
    danger: { bg: color.semantic.danger.base, bgHover: '#A93226', bgPressed: '#96271B', text: color.text.onBrand, border: 'transparent' },
  },
  disabled: { opacity: 0.45 },
  focusRing: `0 0 0 3px ${color.brand[200]}`,
} as const;

/** Card — dipakai dashboard, detail, form section */
export const card = {
  radius: radius.lg,
  padding: { sm: spacing[4], md: spacing[6], lg: spacing[8] },
  bg: color.surface.card,
  border: `1px solid ${color.border.subtle}`,
  shadow: shadow.sm,
  shadowHover: shadow.md,
  headerGap: spacing[4],
} as const;

/** Input / Select / Textarea */
export const input = {
  radius: radius.md,
  height: { sm: 32, md: 40, lg: 48 },
  paddingX: 12,
  bg: color.neutral[0],
  border: `1px solid ${color.border.default}`,
  borderHover: `1px solid ${color.border.strong}`,
  borderError: `1px solid ${color.semantic.danger.base}`,
  placeholder: color.text.muted,
  label: typography['body-strong'],
  helper: typography.caption,
  errorText: color.semantic.danger.text,
  focusRing: `0 0 0 3px ${color.brand[200]}`,
  disabled: { bg: color.neutral[100], text: color.text.disabled },
} as const;

/** Table — dashboard & halaman detail */
export const table = {
  header: {
    bg: color.neutral[100],
    text: color.text.secondary,
    font: typography.overline,
    height: 44,
  },
  row: {
    height: 52,
    bg: color.neutral[0],
    bgHover: color.neutral[50],
    bgStriped: color.neutral[50],
    font: typography.body,
  },
  divider: `1px solid ${color.border.subtle}`,
  cellPaddingX: 16,
  numericAlign: 'right' as const,
} as const;

/** Badge — status di dashboard & detail */
export const badge = {
  radius: radius.full,
  paddingX: 10,
  height: 22,
  font: typography.overline,
  variant: {
    success: { bg: color.semantic.success.bg, text: color.semantic.success.text },
    warning: { bg: color.semantic.warning.bg, text: color.semantic.warning.text },
    danger: { bg: color.semantic.danger.bg, text: color.semantic.danger.text },
    info: { bg: color.semantic.info.bg, text: color.semantic.info.text },
    neutral: { bg: color.neutral[100], text: color.text.secondary },
  },
} as const;

/* ============================================================
 * 7. AGGREGATE EXPORT
 * ============================================================ */

const tokens = {
  color,
  fontFamily,
  fontWeight,
  typography,
  spacing,
  radius,
  shadow,
  motion,
  zIndex,
  breakpoint,
  container,
  layout,
  button,
  card,
  input,
  table,
  badge,
} as const;

export type Tokens = typeof tokens;
export default tokens;