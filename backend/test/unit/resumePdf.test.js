import { describe, expect, it } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPdfBuffer, renderResumeToPdf } from '../../src/modules/resume/pdfRenderer.js';

describe('Resume PDF Generation Unit Tests', () => {
  it('builds a valid PDF 1.4 buffer matching PDF specification', () => {
    const text = 'Experienced Software Engineer with proficiency in JavaScript and TypeScript.\n\nSkills:\n- Node.js\n- React\n- PostgreSQL';
    const buffer = buildPdfBuffer({
      text,
      candidateName: 'John Doe',
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(200);

    const pdfString = buffer.toString('utf8');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.trim().endsWith('%%EOF')).toBe(true);
    expect(pdfString).toContain('/Type /Catalog');
    expect(pdfString).toContain('/Type /Pages');
    expect(pdfString).toContain('John Doe');
  });

  it('renders resume to an actual file on disk', async () => {
    const testPath = resolve(process.cwd(), 'storage', 'test-resume.pdf');
    const text = 'Bachelor of Technology in Computer Science.\nProficient in Python and Go.';

    const outputPath = await renderResumeToPdf({
      text,
      candidateName: 'Jane Smith',
      outputPath: testPath,
    });

    expect(outputPath).toBe(testPath);
    const fileContent = await readFile(testPath);
    expect(fileContent.length).toBeGreaterThan(200);
    expect(fileContent.toString('utf8').startsWith('%PDF-1.4')).toBe(true);

    // Clean up test file
    await unlink(testPath).catch(() => {});
  });
});
