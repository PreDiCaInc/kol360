// v1.17.30 — small color helpers for client-branding theming.
//
// pickReadableTextColor: given a hex color, return white or near-black
// based on perceived luminance. Used so a primary-color-tinted badge
// background still has AA-readable text regardless of what brand color
// the admin picked.
//
// hexToRgb: parse #RRGGBB into {r,g,b}. Tolerant of '#' prefix and
// 3-char shorthand (#abc → #aabbcc). Returns null on malformed input
// so callers can fall through to a safe default.
//
// withAlpha: render a hex color as 'rgba(r, g, b, alpha)' for use as a
// tinted background. Easier than juggling 8-digit hex.

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// WCAG-style relative luminance. Returns 0..1.
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function pickReadableTextColor(bgHex: string, opts?: { light?: string; dark?: string }): string {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return opts?.dark ?? '#111827';
  // Threshold 0.5 is the common pragmatic choice; matches what most
  // material/tailwind helpers use for "is this color light or dark".
  return relativeLuminance(rgb) > 0.5 ? (opts?.dark ?? '#111827') : (opts?.light ?? '#ffffff');
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 102, 204, ${alpha})`; // default brand fallback
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
