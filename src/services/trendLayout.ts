import type { TrendPoint } from './analytics';

export function trendScale(points: TrendPoint[]) {
  const scores = points.flatMap(p => [p.handwriting, p.composition])
    .filter((score): score is number => score !== null && Number.isFinite(score));
  const minimum = Math.max(0, Math.floor(Math.min(60, ...scores) / 5) * 5);
  return {minimum, maximum: 100, step: 5,
    ticks: Array.from({length: (100 - minimum) / 5 + 1}, (_, i) => minimum + i * 5)};
}

export const chartPadding = {left: 32, right: 12, top: 14, bottom: 26};
export function trendX(index: number, count: number, width: number) {
  return count < 2 ? width / 2 : chartPadding.left + index * (width - chartPadding.left - chartPadding.right) / (count - 1);
}
export function trendY(score: number, scale: ReturnType<typeof trendScale>, height: number) {
  return chartPadding.top + (scale.maximum - score) / (scale.maximum - scale.minimum) * (height - chartPadding.top - chartPadding.bottom);
}
