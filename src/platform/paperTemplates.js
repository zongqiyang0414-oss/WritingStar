// Registration rectangles measured from the approved PDF, in PDF coordinates.
// They sit inside the sheet; their centres are not physical paper corners.
export const PAPER_TEMPLATE_SIZE = { width: 1191, height: 842 };
const row = (xs, y, width, height) => xs.map(x => ({ x, y, width, height }));
export const PAPER_TEMPLATES = [
  { id: "fangyuan-front-v1", marks: [
    ...row([56.5, 427, 801.25], 34.5, 18, 12.8),
    ...row([56.5, 379.5, 427, 750, 801.25, 1124.25], 815.3, 25, 7.5),
  ], topCount: 3 },
  { id: "fangyuan-back-v1", marks: [
    ...row([50.25, 425], 34.5, 18, 12.8),
    ...row([50.25, 373.25, 425, 748], 815.3, 25, 7.5),
  ], topCount: 2 },
];
