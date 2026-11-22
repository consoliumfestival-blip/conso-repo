import type { jsPDF } from 'jspdf';

export const PDF_BLACK: [number, number, number] = [0, 0, 0];
export const PDF_WHITE: [number, number, number] = [255, 255, 255];

/** Force jsPDF and AutoTable drawing operations to monochrome with a white page. */
export function applyMonochromePdfTheme(doc: jsPDF) {
  const originalText = doc.setTextColor.bind(doc);
  const originalFill = doc.setFillColor.bind(doc);
  const originalDraw = doc.setDrawColor.bind(doc);
  doc.setTextColor = (() => originalText(...PDF_BLACK)) as typeof doc.setTextColor;
  doc.setFillColor = (() => originalFill(...PDF_WHITE)) as typeof doc.setFillColor;
  doc.setDrawColor = (() => originalDraw(...PDF_BLACK)) as typeof doc.setDrawColor;
  return doc;
}

/** Shared print stylesheet for HTML documents sent to the browser/PDF printer. */
export const PDF_MONOCHROME_CSS = `
  @page { background: #fff; }
  html, body { color: #000 !important; background: #fff !important; }
  *, *::before, *::after {
    color: #000 !important;
    background-color: #fff !important;
    border-color: #000 !important;
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  img, svg { filter: grayscale(1) !important; }
`;
