/**
 * Membaca PDF hasil ekspor aplikasi OTDR (laporan "Report OTDR") dan mengubah
 * tiap halamannya jadi gambar, supaya bisa ditaruh di bawah header LACT/BAUT.
 *
 * Perlu library pdf.js:  npm install pdfjs-dist@6.2.108
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Ketajaman render: 1 = 72 dpi. 2.5 cukup tajam untuk tulisan kecil di laporan. */
const RENDER_SCALE = 2.5;
/** Piksel dianggap "kosong/putih" kalau semua warnanya di atas angka ini. */
const WHITE_THRESHOLD = 246;
/** Jarak aman (piksel) yang disisakan di sekeliling isi saat margin dipotong. */
const TRIM_PADDING = 14;
/**
 * Satu baris tipis yang terpisah jauh dari isi utama (mis. "Page 1" di kaki halaman
 * PDF sumber) diabaikan saat memotong, supaya isi laporan tidak mengecil gara-gara
 * jarak kosong menuju baris itu. Satuan di bawah dalam poin PDF (x RENDER_SCALE).
 */
const MERGE_GAP = 16 * RENDER_SCALE; // jeda sekecil ini dianggap masih satu blok isi
const EDGE_MAX_THICK = 20 * RENDER_SCALE; // blok setipis ini (kira-kira 1-2 baris) boleh diabaikan
const EDGE_MIN_GAP = 48 * RENDER_SCALE; // asal terpisah sejauh ini dari isi utama

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isSorFile = (f: File) => /\.sor$/i.test(f.name);

/**
 * Memotong margin putih di sekeliling isi halaman, supaya isi laporan bisa
 * ditampilkan sebesar mungkin. Kalau halaman kosong, dikembalikan apa adanya.
 */
export function trimWhiteMargins(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  // Per baris: ada tinta atau tidak, dan kolom paling kiri/kanan yang berisi
  const rowInk: boolean[] = new Array(height).fill(false);
  const rowLeft: number[] = new Array(height).fill(width);
  const rowRight: number[] = new Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < WHITE_THRESHOLD || data[i + 1] < WHITE_THRESHOLD || data[i + 2] < WHITE_THRESHOLD) {
        rowInk[y] = true;
        if (x < rowLeft[y]) rowLeft[y] = x;
        if (x > rowRight[y]) rowRight[y] = x;
      }
    }
  }

  // Kelompokkan baris berisi menjadi blok (jeda kecil digabung)
  const blocks: { start: number; end: number }[] = [];
  for (let y = 0; y < height; y++) {
    if (!rowInk[y]) continue;
    const last = blocks[blocks.length - 1];
    if (last && y - last.end <= MERGE_GAP) last.end = y;
    else blocks.push({ start: y, end: y });
  }
  if (blocks.length === 0) return canvas; // halaman kosong

  // Abaikan blok tipis yang terpisah jauh di paling atas / paling bawah
  const isEdgeNoise = (b: { start: number; end: number }, neighbor: { start: number; end: number }) =>
    b.end - b.start + 1 <= EDGE_MAX_THICK &&
    (b.start < neighbor.start ? neighbor.start - b.end : b.start - neighbor.end) >= EDGE_MIN_GAP;
  if (blocks.length >= 2 && isEdgeNoise(blocks[blocks.length - 1], blocks[blocks.length - 2])) blocks.pop();
  if (blocks.length >= 2 && isEdgeNoise(blocks[0], blocks[1])) blocks.shift();

  const top = blocks[0].start;
  const bottom = blocks[blocks.length - 1].end;
  let left = width;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    if (rowLeft[y] < left) left = rowLeft[y];
    if (rowRight[y] > right) right = rowRight[y];
  }

  const x0 = Math.max(0, left - TRIM_PADDING);
  const y0 = Math.max(0, top - TRIM_PADDING);
  const x1 = Math.min(width, right + 1 + TRIM_PADDING);
  const y1 = Math.min(height, bottom + 1 + TRIM_PADDING);

  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  const octx = out.getContext('2d');
  if (!octx) return canvas;
  octx.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Render semua halaman sebuah PDF jadi gambar PNG (data URL), margin putihnya
 * sudah dipotong. `onProgress(selesai, total)` dipanggil tiap halaman selesai.
 */
export async function renderPdfToImages(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const images: string[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas tidak didukung di browser ini');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;
      images.push(trimWhiteMargins(canvas).toDataURL('image/png'));
      page.cleanup();
      onProgress?.(n, pdf.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }
  return images;
}