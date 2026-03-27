import { PDFDocument } from 'pdf-lib'

/**
 * Divide un archivo PDF en fragmentos de un máximo de páginas especificado.
 * @param file El archivo PDF original de tipo File o Uint8Array.
 * @param pagesPerChunk Número máximo de páginas por fragmento (default: 5).
 * @returns Una lista de Uint8Array, cada uno representando un fragmento de PDF.
 */
export async function dividePdfIntoChunks(
  file: File | Uint8Array,
  pagesPerChunk: number = 5
): Promise<Uint8Array[]> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const pdfDoc = await PDFDocument.load(data as ArrayBuffer | Uint8Array);
  const pageCount = pdfDoc.getPageCount()
  const chunks: Uint8Array[] = []

  for (let i = 0; i < pageCount; i += pagesPerChunk) {
    const chunkDoc = await PDFDocument.create()
    const endPage = Math.min(i + pagesPerChunk, pageCount)
    
    // Índices de páginas a copiar (0-indexed)
    const pagesToCopy = Array.from({ length: endPage - i }, (_, index) => i + index)
    
    const copiedPages = await chunkDoc.copyPages(pdfDoc, pagesToCopy)
    copiedPages.forEach((page) => chunkDoc.addPage(page))
    
    const chunkBytes = await chunkDoc.save()
    chunks.push(chunkBytes)
  }

  return chunks
}
