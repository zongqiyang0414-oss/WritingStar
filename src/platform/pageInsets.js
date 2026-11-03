export function nativeNavigationMetrics(info = {}, capsule = {}) {
  const top = Math.max(0, info.statusBarHeight || 0, info.safeArea?.top || 0);
  const row = Math.max(44, (capsule.height || 0) + 2 * Math.max(0, (capsule.top || top) - top));
  return { top, height: top + row,
    bottom: Math.max(0, (info.screenHeight || 0) - (info.safeArea?.bottom || info.screenHeight || 0)),
    menuSpace: capsule.left ? Math.max(80, (info.windowWidth || 390) - capsule.left + 12) : 96 };
}

export function landscapePageHeight(width, windowHeight = 0) {
  return Math.round(Math.min(width / Math.SQRT2, windowHeight > 0 ? Math.max(100, windowHeight * .65) : Infinity));
}
