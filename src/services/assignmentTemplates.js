// Local template bank. Teacher-created entries are stored additively in schema 6.
export const BUILTIN_ASSIGNMENT_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "template-observation",
    title: "我的一次新发现",
    requirements: "观察身边的一件事物，写清它的样子和自己的发现。注意段落安排，书写工整，按页序提交作品。",
    builtin: true,
  }),
  Object.freeze({
    id: "template-story",
    title: "放学路上的一件小事",
    requirements: "按事情发展的顺序写清经过，选取具体的动作、语言或心理描写，表达自己的感受。书写工整，按页序提交作品。",
    builtin: true,
  }),
  Object.freeze({
    id: "template-thanks",
    title: "我想感谢的一个人",
    requirements: "选择一件具体的事情，写清这个人怎样帮助了你，表达感谢之情。注意字的结构和行间距，按页序提交作品。",
    builtin: true,
  }),
]);

export function assignmentContent(input = {}) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const requirements = typeof input.requirements === "string" ? input.requirements.trim() : "";
  if (!title) throw new Error("请填写作业标题。");
  return { title, requirements };
}
