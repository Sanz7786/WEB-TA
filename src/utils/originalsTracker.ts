/**
 * Pelacak foto ASLI untuk fitur "Paket PDF Lengkap" (lihat pdfBundle.ts).
 *
 * MASALAHNYA: tiap form menyimpan file foto aslinya di state komponennya
 * sendiri, jadi dari luar form (bilah Paket PDF di MainLayout) foto asli itu
 * tidak bisa diambil. Tanpa foto asli, hasil gabungan hanya memakai versi
 * ringan di layar (maks. 1600px) — lebih buram daripada unduhan biasa per
 * bagian.
 *
 * SOLUSINYA (tanpa mengubah satu pun form): setiap kali user memilih/menyeret
 * file gambar, file itu dicatat di sini, lalu dikompres ulang DENGAN FUNGSI
 * DAN PENGATURAN YANG SAMA (`compressImage(file)`, bawaan) seperti yang
 * dipakai semua form. Hasilnya identik dengan gambar preview di layar, jadi
 * hasil kompres itu bisa dipakai sebagai KUNCI untuk menemukan file aslinya:
 * `findOriginal(img.src)`. Kalau tidak ketemu (misalnya foto hasil menu
 * Kompres Foto), pemanggil cukup memakai gambar preview apa adanya.
 */
import { compressImage, MAX_ORIGINAL_BYTES } from './imageCompress';

const MAX_ENTRIES = 300;
const originalByPreview = new Map<string, File>();
const queue: File[] = [];
let running = false;
let installed = false;

const isTrackable = (f: File) => f.type.startsWith('image/') && f.size <= MAX_ORIGINAL_BYTES;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const file = queue.shift() as File;
      try {
        const previewUrl = await compressImage(file);
        originalByPreview.set(previewUrl, file);
        while (originalByPreview.size > MAX_ENTRIES) {
          const oldest = originalByPreview.keys().next().value;
          if (oldest === undefined) break;
          originalByPreview.delete(oldest);
        }
      } catch {
        // file tidak bisa dibaca: abaikan saja, nanti dipakai versi preview
      }
      // beri napas ke browser supaya form yang sedang bekerja tidak tersendat
      await new Promise((r) => setTimeout(r, 30));
    }
  } finally {
    running = false;
  }
}

function enqueue(files: Iterable<File>) {
  for (const f of files) {
    if (isTrackable(f)) queue.push(f);
  }
  void drain();
}

/** Pasang pendengar global (sekali saja). Aman dipanggil berulang. */
export function installOriginalsTracker() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // Fase "capture" supaya terbaca SEBELUM handler form mengosongkan input-nya.
  document.addEventListener(
    'change',
    (e) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.tagName === 'INPUT' && t.type === 'file' && t.files) {
        enqueue(Array.from(t.files));
      }
    },
    true
  );
  document.addEventListener(
    'drop',
    (e) => {
      const files = (e as DragEvent).dataTransfer?.files;
      if (files) enqueue(Array.from(files));
    },
    true
  );
}

/** Cari file asli dari alamat gambar preview (data URL). */
export function findOriginal(previewSrc: string): File | undefined {
  return originalByPreview.get(previewSrc);
}

/** Tunggu sampai semua file yang baru dipilih selesai dicatat (maks. `maxMs`). */
export async function whenTrackerIdle(maxMs = 20000): Promise<void> {
  const start = Date.now();
  while ((running || queue.length > 0) && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 60));
  }
}