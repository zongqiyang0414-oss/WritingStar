// A small, streaming PDF writer: each JPEG is written immediately instead of
// keeping a whole class of high-resolution canvases in memory.
function ascii(value) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i);
  return bytes;
}

export async function createImagePdf(append) {
  let position = 0, finished = false;
  const offsets = [0], pages = [];
  async function write(value) {
    const bytes = typeof value === "string" ? ascii(value) : new Uint8Array(value);
    await append(bytes.buffer);
    position += bytes.byteLength;
  }
  async function object(id, body) {
    offsets[id] = position;
    await write(`${id} 0 obj\n${body}\nendobj\n`);
  }
  await write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  return {
    async addPage(jpeg, width, height) {
      if (finished) throw new Error("PDF已结束写入。");
      const bytes = new Uint8Array(jpeg);
      if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || !(width > 0 && height > 0))
        throw new Error("答题卡图片无效，请重新生成。");
      const id = 3 + pages.length * 3, image = id + 1, content = id + 2;
      // A4 points; the complete canvas, including QR and corner marks, fits the page.
      const pw = width > height ? 841.89 : 595.28, ph = width > height ? 595.28 : 841.89;
      await object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Card ${image} 0 R >> >> /Contents ${content} 0 R >>`);
      offsets[image] = position;
      await write(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      await write(bytes);
      await write("\nendstream\nendobj\n");
      const commands = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Card Do\nQ\n`;
      await object(content, `<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
      pages.push(id);
    },
    async finish() {
      if (finished || !pages.length) throw new Error("暂无可打印的答题卡。");
      await object(1, "<< /Type /Catalog /Pages 2 0 R >>");
      await object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id => `${id} 0 R`).join(" ")}] >>`);
      const start = position;
      await write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
      for (let id = 1; id < offsets.length; id++) await write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
      await write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
      finished = true;
    },
  };
}
