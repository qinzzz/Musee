/**
 * Color utility functions for converting and manipulating colors
 */

/**
 * Convert hex color to RGB
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * Convert RGB to HSL (Hue, Saturation, Lightness)
 */
export const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

/**
 * Convert HSL to RGB
 */
export const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

/**
 * Create a softer, less saturated version of a color
 * Reduces saturation by 60% and increases lightness for a pastel effect
 *
 * @param hexColor - Hex color string (e.g., "#FF0000")
 * @param fallbackColor - Fallback color if conversion fails
 * @returns RGB color string (e.g., "rgb(245, 220, 220)")
 */
export const softenColor = (hexColor: string, fallbackColor: string = '#F5F5F5'): string => {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return fallbackColor;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Reduce saturation by 60% and increase lightness significantly
  const newS = hsl.s * 0.5; // Keep only 40% of original saturation
  const newL = Math.min(hsl.l * 1.5 + 20, 95); // Increase lightness, cap at 95%

  const newRgb = hslToRgb(hsl.h, newS, newL);

  return `rgba(${newRgb.r}, ${newRgb.g}, ${newRgb.b}, 0.75)`;
};

/**
 * Brighten a color by increasing its lightness
 * Works with both hex colors and rgb/rgba strings
 *
 * @param color - Color string (hex like "#FF0000" or rgb like "rgb(255, 0, 0)")
 * @param amount - Amount to brighten (0-100), default is 15
 * @returns Brightened color as rgb string
 */
export const brightenColor = (color: string, amount: number = 15): string => {
  let r = 0, g = 0, b = 0;

  // Parse hex color
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (rgb) {
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }
  }
  // Parse rgb/rgba color
  else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  }

  // Convert to HSL
  const hsl = rgbToHsl(r, g, b);

  // Increase lightness
  const newL = Math.min(hsl.l + amount, 95);

  // Convert back to RGB
  const newRgb = hslToRgb(hsl.h, hsl.s, newL);

  return `rgb(${newRgb.r}, ${newRgb.g}, ${newRgb.b})`;
};

/**
 * Get either black or white, whichever is further away from the given color
 * Works with both hex colors and rgb/rgba strings
 * Uses the relative luminance formula to determine which color provides better contrast
 *
 * @param color - Color string (hex like "#FF0000" or rgb like "rgb(255, 0, 0)")
 * @returns Either "#000000" (black) or "#FFFFFF" (white)
 */
export const getOppositeColor = (color: string): string => {
  let r = 0, g = 0, b = 0;

  // Parse hex color
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (rgb) {
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }
  }
  // Parse rgb/rgba color
  else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  }

  // Calculate relative luminance using the formula:
  // L = 0.2126 * R + 0.7152 * G + 0.0722 * B
  // where R, G, B are normalized to 0-1
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // If luminance is closer to white (> 0.5), return black, otherwise return white
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};
