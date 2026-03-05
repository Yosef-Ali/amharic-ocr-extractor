// Type declaration for html2pdf.js (no official @types package)
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string; orientation?: string };
  }
  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement | null): Html2Pdf;
    save(): Promise<void>;
  }
  function html2pdf(): Html2Pdf;
  export default html2pdf;
}
