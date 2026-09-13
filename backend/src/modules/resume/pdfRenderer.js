import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Escapes characters for PDF string literals.
 * @param {string} str
 * @returns {string}
 */
function escapePdfText(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E\t\n\r]/g, ' '); // Clean non-ASCII for standard Type1 fonts
}

/**
 * Wraps long lines into chunks that fit on a standard 612x792 pt (Letter/A4) page.
 * @param {string} text
 * @param {number} [maxCharsPerLine=80]
 * @returns {string[]}
 */
function wrapLines(text, maxCharsPerLine = 80) {
  const result = [];
  const rawLines = text.split(/\r?\n/);

  for (const raw of rawLines) {
    if (raw.length <= maxCharsPerLine) {
      result.push(raw);
    } else {
      const words = raw.split(/\s+/);
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > maxCharsPerLine) {
          if (current) result.push(current);
          current = word;
        } else {
          current = current ? current + ' ' + word : word;
        }
      }
      if (current) result.push(current);
    }
  }

  return result;
}

/**
 * Generates a valid standard PDF 1.4 binary buffer from text.
 * Uses standard PDF specification objects (Catalog, Pages, Page, Helvetica Fonts, Content Stream).
 *
 * @param {{ text: string, candidateName?: string }} input
 * @returns {Buffer}
 */
export function buildPdfBuffer({ text, candidateName = 'Candidate Resume' }) {
  const lines = wrapLines(text || '');
  const linesPerPage = 45;
  const pages = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) {
    pages.push(['']);
  }

  // Build stream content for each page
  const pageStreamContents = pages.map((pageLines, pageIdx) => {
    const streamParts = ['BT'];

    if (pageIdx === 0) {
      // Header on first page
      streamParts.push('/F2 16 Tf');
      streamParts.push('50 740 Td');
      streamParts.push(`(${escapePdfText(candidateName)}) Tj`);
      streamParts.push('/F1 10 Tf');
      streamParts.push('0 -24 Td');
    } else {
      streamParts.push('/F1 10 Tf');
      streamParts.push('50 740 Td');
    }

    for (const line of pageLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        streamParts.push('0 -12 Td');
        continue;
      }

      // Check if line looks like a heading
      const isHeader =
        trimmed.endsWith(':') ||
        trimmed.startsWith('#') ||
        trimmed === trimmed.toUpperCase() && trimmed.length > 3;

      if (isHeader) {
        streamParts.push('/F2 11 Tf');
        streamParts.push(`(${escapePdfText(trimmed.replace(/^#+\s*/, ''))}) Tj`);
        streamParts.push('/F1 10 Tf');
        streamParts.push('0 -14 Td');
      } else {
        streamParts.push(`(${escapePdfText(trimmed)}) Tj`);
        streamParts.push('0 -12 Td');
      }
    }

    streamParts.push('ET');
    return streamParts.join('\n');
  });

  // Calculate object structure
  // 1 0 obj: Catalog
  // 2 0 obj: Pages
  // Font objects:
  // 3 0 obj: Font F1 (Helvetica)
  // 4 0 obj: Font F2 (Helvetica-Bold)
  // For each page:
  // (5 + 2*i) 0 obj: Page
  // (6 + 2*i) 0 obj: Stream content

  const objects = [];
  const pageCount = pages.length;
  const pageObjIds = [];

  for (let i = 0; i < pageCount; i += 1) {
    const pageId = 5 + i * 2;
    pageObjIds.push(pageId);
  }

  // 1 0 obj: Catalog
  objects.push({
    id: 1,
    content: '<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>',
  });

  // 2 0 obj: Pages
  objects.push({
    id: 2,
    content: `<<\n  /Type /Pages\n  /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}]\n  /Count ${pageCount}\n>>`,
  });

  // 3 0 obj: Font Helvetica
  objects.push({
    id: 3,
    content: '<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n>>',
  });

  // 4 0 obj: Font Helvetica-Bold
  objects.push({
    id: 4,
    content: '<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n>>',
  });

  // Page and Content objects
  pages.forEach((_, idx) => {
    const pageId = 5 + idx * 2;
    const contentId = pageId + 1;
    const streamContent = pageStreamContents[idx];
    const streamLength = Buffer.byteLength(streamContent, 'utf8');

    // Page object
    objects.push({
      id: pageId,
      content: `<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 612 792]\n  /Resources <<\n    /Font <<\n      /F1 3 0 R\n      /F2 4 0 R\n    >>\n  >>\n  /Contents ${contentId} 0 R\n>>`,
    });

    // Content object
    objects.push({
      id: contentId,
      content: `<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream`,
    });
  });

  // Sort objects by id
  objects.sort((a, b) => a.id - b.id);

  let pdfOutput = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdfOutput, 'utf8'));
    pdfOutput += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdfOutput, 'utf8');
  pdfOutput += `xref\n0 ${objects.length + 1}\n`;
  pdfOutput += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    pdfOutput += `${offsetStr} 00000 n \n`;
  }

  pdfOutput += `trailer\n<<\n  /Size ${objects.length + 1}\n  /Root 1 0 R\n>>\n`;
  pdfOutput += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdfOutput, 'utf8');
}

/**
 * Renders tailored resume text into an actual PDF file on disk.
 *
 * @param {{
 *   text: string,
 *   candidateName?: string,
 *   outputPath?: string,
 *   applicationId?: string
 * }} params
 * @returns {Promise<string>} The absolute path to the generated PDF file.
 */
export async function renderResumeToPdf({ text, candidateName, outputPath, applicationId }) {
  const targetPath =
    outputPath ||
    resolve(process.cwd(), 'storage', 'resumes', `resume-${applicationId || Date.now()}.pdf`);

  await mkdir(dirname(targetPath), { recursive: true });
  const pdfBuffer = buildPdfBuffer({ text, candidateName });
  await writeFile(targetPath, pdfBuffer);
  return targetPath;
}
