export const RUBRIC_VERSION = "legacy-backend-five-thinking-v1";
export const DIMENSION_IDS = [
  "intuitive",
  "imaginal",
  "logical",
  "dialectical",
  "creative",
];
export const DIMENSION_NAMES = [
  "直觉思维",
  "形象思维",
  "逻辑思维",
  "辩证思维",
  "创造思维",
];
export const HANDWRITING_DESCRIPTIONS = [
  "从笔画、点位、规范以及美观方面进行点评。",
  "从笔画、笔锋方面进行点评。",
  "从结构方面进行点评。",
  "从章法方面进行点评。",
  "从整体的创造性方面进行点评，超出常人的书法规范方面进行点评。",
];
export const COMPOSITION_DESCRIPTIONS = [
  "写字要素：能在方圆格辅助下将作文书写在格子正中间，点位正确，结构规范，章法美观，且有一定速度。无错别字，可用行楷字。阅读要素：体会文章如何表达情感。习作要素：选择合适内容写出真情实感。",
  "将情感融入具体的人、事或景物中，自然流露情感。通过积极或消极的情感渲染，形成新的意境。",
  "内容围绕中心，符合逻辑同一律原则。按顺叙、倒叙、插叙等方式清晰叙述事情经过，详略得当。",
  "立意：主题积极乐观，表达美好愿望及对真善美的追求。",
  "运用比喻、比照、排比、设问等修辞手法，使文章生动真切。通过心理、语言、动作、神态等描写方法，真实展现情感变化。",
];
export const rubric = {
  handwriting: DIMENSION_IDS.map((e, a) => ({
    id: e,
    name: DIMENSION_NAMES[a],
    max: [10, 60, 10, 10, 10][a],
    description: HANDWRITING_DESCRIPTIONS[a],
  })),
  composition: DIMENSION_IDS.map((e, a) => ({
    id: e,
    name: DIMENSION_NAMES[a],
    max: [10, 20, 30, 20, 20][a],
    description: COMPOSITION_DESCRIPTIONS[a],
  })),
};
export function total(evaluation) {
  const a = DIMENSION_IDS.map((a) => evaluation.scores[a]);
  return a.every((e) => "number" == typeof e && Number.isFinite(e))
    ? a.reduce((e, a) => e + a, 0)
    : null;
}
export function validateReview(review) {
  if (review.rubricVersion !== RUBRIC_VERSION)
    return "评价标准版本不一致，请重新加载作品。";
  for (const a of ["handwriting", "composition"]) {
    const t = "handwriting" === a ? "书写" : "写作";
    for (const s of rubric[a]) {
      const l = review[a].scores[s.id];
      if ("number" != typeof l || !Number.isFinite(l) || l < 0 || l > s.max)
        return `${t}「${s.name}」请填写 0–${s.max} 的有效分数。`;
    }
    if (!review[a].summary.trim()) return `请填写${t}总评。`;
  }
  return review.nextSteps.trim() ? null : "请填写给学生的订正建议。";
}
export function emptyReview() {
  const e = () => ({
    scores: Object.fromEntries(DIMENSION_IDS.map((e) => [e, null])),
    comments: Object.fromEntries(DIMENSION_IDS.map((e) => [e, ""])),
    summary: "",
  });
  return {
    handwriting: e(),
    composition: e(),
    nextSteps: "",
    rubricVersion: RUBRIC_VERSION,
  };
}
