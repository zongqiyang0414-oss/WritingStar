import { writeFile } from 'node:fs/promises';
const paragraphs = [
  ['放学以后，我背着书包，沿着熟悉的小路往家走。秋天的阳光洒在树叶上，像一层温暖的金色。', '走到街角时，我看见一位阿姨正拎着满满的袋子。忽然，袋子破了，袋子里的橘子滚了出来。我停下脚步，想了想，朝阿姨跑过去。', '我把书包放在路边，蹲下来捡橘子。一个橘子滚到了树下，我伸出手，小心地把它捡起来。它圆圆的，像小太阳。'],
  ['阿姨有些着急，我说：“别担心，我来帮您。”我从书包里拿出一个布袋，把橘子一个一个装进去，再把袋子递给阿姨。', '阿姨笑着说：“谢谢你，小朋友！”听到这句话，我心里暖暖的。我挥了挥手，重新背上书包。路边的树叶沙沙地响着，好像也在为我鼓掌。', '这件小事让我明白，关心别人并不一定要做很大的事情。原来，一点小小的帮助也能让人开心。那一天，我觉得回家的路特别明亮。']
];
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(let page=0;page<2;page++) {
  let y=152;let glyphs='';
  for(const paragraph of paragraphs[page]) {
    let column=2;
    for(const character of paragraph) {
      if(column===18){column=0;y+=28;}
      glyphs+=`<text x="${48+column*28+14}" y="${y}" text-anchor="middle">${escape(character)}</text>`;
      column++;
    }
    y+=56;
  }
  let grid='';
  for(let i=0;i<=18;i++)grid+=`<path d="M${48+i*28} 130V718"/>`;
  for(let i=0;i<=21;i++)grid+=`<path d="M48 ${130+i*28}H552"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820" viewBox="0 0 600 820"><rect width="600" height="820" fill="#fffdf5"/><rect x="26" y="26" width="548" height="768" rx="3" fill="none" stroke="#ece8db"/><text x="300" y="67" text-anchor="middle" font-family="SimSun,serif" font-size="25" fill="#4c5742">放学路上的一件小事</text><text x="300" y="101" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="11" fill="#a2a18c">四年级（1）班 · 小禾 · 第 ${page+1} 页</text><g fill="none" stroke="#ddbeb2" stroke-width=".65" opacity=".7">${grid}</g><g fill="#595c4d" font-family="SimSun,serif" font-size="20">${glyphs}</g><text x="300" y="761" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="10" fill="#aaa48f">语文 · 双写练习</text></svg>`;
  await writeFile(new URL(`../src/static/essay-${page+1}.svg`,import.meta.url),svg,'utf8');
}
console.log('Created two typeset essay samples for the prototype.');
