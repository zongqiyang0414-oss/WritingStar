import type { Category, Dimension, DimensionId, Evaluation, Review } from './model';
export const RUBRIC_VERSION = 'legacy-backend-five-thinking-v1';
export const dimensionIds: DimensionId[] = ['intuitive', 'imaginal', 'logical', 'dialectical', 'creative'];
const names = ['直觉思维', '形象思维', '逻辑思维', '辩证思维', '创造思维'];
const handwritingDescriptions = ['从笔画、点位、规范以及美观方面进行点评。', '从笔画、笔锋方面进行点评。', '从结构方面进行点评。', '从章法方面进行点评。', '从整体的创造性方面进行点评，超出常人的书法规范方面进行点评。'];
const compositionDescriptions = [
  '写字要素：能在方圆格辅助下将作文书写在格子正中间，点位正确，结构规范，章法美观，且有一定速度。无错别字，可用行楷字。阅读要素：体会文章如何表达情感。习作要素：选择合适内容写出真情实感。',
  '将情感融入具体的人、事或景物中，自然流露情感。通过积极或消极的情感渲染，形成新的意境。',
  '内容围绕中心，符合逻辑同一律原则。按顺叙、倒叙、插叙等方式清晰叙述事情经过，详略得当。',
  '立意：主题积极乐观，表达美好愿望及对真善美的追求。',
  '运用比喻、比照、排比、设问等修辞手法，使文章生动真切。通过心理、语言、动作、神态等描写方法，真实展现情感变化。'
];
export const rubric: Record<Category, Dimension[]> = {
  handwriting: dimensionIds.map((id, i) => ({id, name: names[i], max: [10,60,10,10,10][i], description: handwritingDescriptions[i]})),
  composition: dimensionIds.map((id, i) => ({id, name: names[i], max: [10,20,30,20,20][i], description: compositionDescriptions[i]}))
};
export function total(evaluation: Evaluation): number | null {
  const values = dimensionIds.map(id => evaluation.scores[id]);
  return values.every(n => typeof n === 'number' && Number.isFinite(n)) ? values.reduce<number>((sum,n) => sum + (n as number), 0) : null;
}
export function validateReview(review: Review): string | null {
  if (review.rubricVersion !== RUBRIC_VERSION) return '评价标准版本不一致，请重新加载作品。';
  for (const category of ['handwriting', 'composition'] as Category[]) {
    const name = category === 'handwriting' ? '书写' : '写作';
    for (const d of rubric[category]) {
      const n = review[category].scores[d.id];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > d.max) return `${name}「${d.name}」请填写 0–${d.max} 的有效分数。`;
    }
    if (!review[category].summary.trim()) return `请填写${name}总评。`;
  }
  if (!review.nextSteps.trim()) return '请填写给学生的订正建议。';
  return null;
}
export function emptyReview(): Review {
  const evaluation = (): Evaluation => ({scores: Object.fromEntries(dimensionIds.map(id => [id, null])) as Evaluation['scores'], comments: Object.fromEntries(dimensionIds.map(id => [id, ''])) as Evaluation['comments'], summary: ''});
  return {handwriting: evaluation(), composition: evaluation(), nextSteps: '', rubricVersion: RUBRIC_VERSION};
}
