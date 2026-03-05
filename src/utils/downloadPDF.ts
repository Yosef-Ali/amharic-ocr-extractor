/** Render pageResults HTML to a temporary off-screen container and export as PDF. */
export async function downloadDocumentAsPDF(
  name: string,
  pageResults: Record<number, string>,
): Promise<void> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-99999px;top:0;width:210mm;pointer-events:none;z-index:-1;';

  Object.entries(pageResults)
    .sort(([a], [b]) => +a - +b)
    .forEach(([, html]) => {
      const page = document.createElement('div');
      page.style.cssText =
        'width:210mm;min-height:297mm;padding:12mm 16mm;' +
        'font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;' +
        'font-size:1rem;box-sizing:border-box;line-height:1.6;background:white;';
      page.innerHTML = html;
      container.appendChild(page);
    });

  document.body.appendChild(container);

  try {
    await document.fonts.ready;
    const { jsPDF }         = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas: any  = html2canvasModule.default ?? html2canvasModule;

    const pages = container.children;
    const pdf   = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < pages.length; i++) {
      const el = pages[i] as HTMLElement;
      const canvas = await html2canvas(el, {
        scale:   2,
        useCORS: true,
        logging: false,
        width:   el.scrollWidth,
        height:  Math.round(297 * (96 / 25.4)),
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297);
    }

    pdf.save(`${name.replace(/\.[^.]+$/, '') || 'document'}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
