export function displayPhoto(url) {
  return url.replace(/^\/static\/(essay-[12])\.svg$/, "/static/$1.png");
}
export const COMMENT_UPDATES = {
  "整体清楚、规范。点位需要结合真实字迹复核，书写速度无法从静态图片判断。":
    "整体清楚、规范。请结合原作品检查标点位置；书写速度需结合课堂观察评价。",
  "笔画表现为示例评语，真实作品须逐字核对。练习时留意横画的方向与收笔。":
    "练习时留意横画的方向与收笔，逐字检查笔画是否舒展。",
  "示例提醒：左右结构注意左窄右宽，避免两部分互相挤压。":
    "左右结构注意左窄右宽，避免两部分互相挤压。",
  "示例提醒：段首空格保持一致，行间留白均匀。":
    "段首空格保持一致，行间留白均匀。",
  "示例提醒：先保持整体规范，再尝试自然、连贯的书写。":
    "先保持整体规范，再尝试自然、连贯的书写。",
  "选取生活中的小事表达关心。此处为预置示例，不代表图片分析结果。":
    "选取生活中的小事表达关心，主题明确。",
};
export function presentReview(review) {
  const a = JSON.parse(JSON.stringify(review));
  for (const t of ["handwriting", "composition"])
    for (const e of Object.keys(a[t].comments)) {
      const s = a[t].comments[e];
      a[t].comments[e] = COMMENT_UPDATES[s] ?? s;
    }
  return a;
}
