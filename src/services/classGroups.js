const grades = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

export function classGrade(name = "") {
  const match = name.match(/(小学|初中|高中)?([一二三四五六七八九十\d]+)年级|(?:初|高)[一二三]/);
  if (!match) return "其他班级";
  if (!match[2]) return match[0];
  const number = Number(match[2]);
  return `${match[1] || ""}${number > 0 && number <= grades.length ? grades[number - 1] : match[2]}年级`;
}

export function groupClasses(classes = []) {
  const groups = new Map();
  for (const item of classes) {
    const grade = classGrade(item.name);
    if (!groups.has(grade)) groups.set(grade, []);
    groups.get(grade).push(item);
  }
  const order = name => {
    if (name === "其他班级") return 100;
    if (/^初/.test(name)) return 20 + grades.findIndex(item => name.includes(item));
    if (/^高/.test(name)) return 40 + grades.findIndex(item => name.includes(item));
    return grades.findIndex(item => name === `${item}年级` || name === `小学${item}年级`);
  };
  return [...groups].sort(([a], [b]) => order(a) - order(b)).map(([name, items]) => ({
    name, classes: [...items].sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })),
  }));
}
