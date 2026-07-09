// Markdown → docx conversion for fs write. Line-level Markdown: headings,
// lists, quotes, code fences, tables, paragraphs; inline bold/italic/code.

type DocxBlock = import('docx').Paragraph | import('docx').Table;

export async function markdownToDocx(markdown: string): Promise<ArrayBuffer> {
  const docx = await import('docx');
  const blocks: DocxBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;

    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      for (const codeLine of code) {
        blocks.push(new docx.Paragraph({ children: [new docx.TextRun({ text: codeLine || ' ', font: 'Consolas', size: 18 })], shading: { type: docx.ShadingType.SOLID, color: 'F3F4F6' } }));
      }
      continue;
    }

    if (line.includes('|') && isTableSeparator(lines[index + 1])) {
      const tableLines = [line];
      index += 1; // skip separator
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim() !== '') tableLines.push(lines[++index]);
      blocks.push(buildTable(docx, tableLines));
      continue;
    }

    blocks.push(buildParagraph(docx, line));
  }

  const documentFile = new docx.Document({ sections: [{ children: blocks.length > 0 ? blocks : [new docx.Paragraph('')] }] });
  return docx.Packer.toArrayBuffer(documentFile);
}

function buildParagraph(docx: typeof import('docx'), line: string) {
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    const levels = [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3, docx.HeadingLevel.HEADING_4, docx.HeadingLevel.HEADING_5, docx.HeadingLevel.HEADING_6];
    return new docx.Paragraph({ children: inlineRuns(docx, heading[2]), heading: levels[heading[1].length - 1] });
  }
  const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
  if (bullet) return new docx.Paragraph({ children: inlineRuns(docx, bullet[1]), bullet: { level: 0 } });
  const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
  if (ordered) return new docx.Paragraph({ children: inlineRuns(docx, ordered[1]), bullet: { level: 0 } });
  const quote = /^>\s?(.*)$/.exec(line);
  if (quote) return new docx.Paragraph({ children: inlineRuns(docx, quote[1]), indent: { left: 360 }, border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: 'CBD5E1' } } });
  return new docx.Paragraph({ children: inlineRuns(docx, line) });
}

function buildTable(docx: typeof import('docx'), tableLines: string[]) {
  const rows = tableLines.map((rowLine, rowIndex) => {
    const cells = splitTableRow(rowLine).map((cell) =>
      new docx.TableCell({ children: [new docx.Paragraph({ children: inlineRuns(docx, cell, rowIndex === 0) })] }),
    );
    return new docx.TableRow({ children: cells });
  });
  return new docx.Table({ rows, width: { size: 100, type: docx.WidthType.PERCENTAGE } });
}

function isTableSeparator(line: string | undefined) {
  return Boolean(line && /^\s*\|?\s*:?-{2,}/.test(line) && line.includes('-'));
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function inlineRuns(docx: typeof import('docx'), text: string, forceBold = false) {
  const runs: import('docx').TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > lastIndex) runs.push(new docx.TextRun({ text: text.slice(lastIndex, match.index), bold: forceBold }));
    const token = match[0];
    if (token.startsWith('**')) runs.push(new docx.TextRun({ text: token.slice(2, -2), bold: true }));
    else if (token.startsWith('`')) runs.push(new docx.TextRun({ text: token.slice(1, -1), font: 'Consolas', bold: forceBold }));
    else runs.push(new docx.TextRun({ text: token.slice(1, -1), italics: true, bold: forceBold }));
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) runs.push(new docx.TextRun({ text: text.slice(lastIndex), bold: forceBold }));
  return runs.length > 0 ? runs : [new docx.TextRun({ text: '', bold: forceBold })];
}

export async function docxToText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  // Browser build of mammoth accepts { arrayBuffer }; the Node build (tests) accepts { buffer }.
  const input = typeof Buffer === 'undefined' ? { arrayBuffer: data } : { buffer: Buffer.from(data) };
  const result = await mammoth.extractRawText(input as never);
  return result.value.trim();
}
