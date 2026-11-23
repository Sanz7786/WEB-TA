/**
 * "Paket PDF Lengkap": menyimpan hasil render tiap bagian (Cover, Daftar Isi,
 * ..., Lampiran KML) lalu menggabungkan semuanya jadi SATU file PDF.
 *
 * KENAPA hasil render yang disimpan, bukan isian formnya: tiap form menyimpan
 * isiannya di state komponennya sendiri dan HILANG saat user pindah menu.
 * Jadi saat user menekan "Simpan & Lanjut", halaman-halaman preview yang
 * sedang tampil di-"screenshot" (cara yang SAMA dengan unduhan biasa di
 * utils/pdfFromElement.ts: html2canvas per elemen .pdf-page) lalu disimpan di
 * memori. Form-form yang sudah ada TIDAK diubah sama sekali; tombol unduh
 * per bagian tetap berfungsi seperti biasa.
 *
 * Paket disimpan di MEMORI saja (hilang kalau halaman di-refresh/ditutup) dan
 * dipisah per jenis dokumen: paket LACT dan paket BAUT tidak bercampur.
 */
import { useSyncExternalStore } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { findOriginal, installOriginalsTracker, whenTrackerIdle } from './originalsTracker';

installOriginalsTracker();

export interface BundlePage {
  /** Gambar JPEG halaman (data URL) */
  img: string;
  /** Posisi & ukuran di halaman A4, satuan mm */
  x: number;
  w: number;
  h: number;
}

interface BundleEntry {
  pages: BundlePage[];
  savedAt: number;
}

export interface QualitySetting {
  scale: number;
  jpeg: number;
}

// builderId (mis. 'lact-builder') -> mode (mis. 'cover') -> isi
const bundles = new Map<string, Map<string, BundleEntry>>();
const fileLabels = new Map<string, string>();
// Nama file paket yang diketik user (per builderId). Tidak memicu render ulang:
// BundleBar membacanya sekali saat dibuka di halaman mana pun.
const bundleNames = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getVersion = () => version;

/** Hook: komponen ikut dirender ulang setiap isi paket berubah. */
export function useBundleVersion(): number {
  return useSyncExternalStore(subscribe, getVersion);
}

export function isSectionSaved(builderId: string, mode: string): boolean {
  return bundles.get(builderId)?.has(mode) ?? false;
}

export function getSectionPageCount(builderId: string, mode: string): number {
  return bundles.get(builderId)?.get(mode)?.pages.length ?? 0;
}

export function removeSection(builderId: string, mode: string) {
  bundles.get(builderId)?.delete(mode);
  emit();
}

export function clearBundle(builderId: string) {
  bundles.delete(builderId);
  fileLabels.delete(builderId);
  bundleNames.delete(builderId);
  emit();
}

/** Nama file paket yang diketik user (kosong = pakai nama otomatis). */
export function getBundleName(builderId: string): string {
  return bundleNames.get(builderId) ?? '';
}

export function setBundleName(builderId: string, name: string) {
  if (name) bundleNames.set(builderId, name);
  else bundleNames.delete(builderId);
}

export function saveSection(builderId: string, mode: string, pages: BundlePage[], fileLabel?: string) {
  let m = bundles.get(builderId);
  if (!m) {
    m = new Map();
    bundles.set(builderId, m);
  }
  m.set(mode, { pages, savedAt: Date.now() });
  if (fileLabel) fileLabels.set(builderId, fileLabel);
  emit();
}

export function getFileLabel(builderId: string): string {
  return fileLabels.get(builderId) ?? '';
}

/** Ambil nama lokasi dari tabel info proyek di halaman yang sedang tampil (untuk nama file). */
export function readLokasiFromPreview(root: HTMLElement): string {
  const rows = Array.from(root.querySelectorAll('.pdf-info-row'));
  for (const row of rows) {
    const spans = row.querySelectorAll('span');
    if (spans.length >= 2 && (spans[0].textContent ?? '').trim().toUpperCase() === 'LOKASI') {
      return (spans[1].textContent ?? '').replace(/^\s*:\s*/, '').trim();
    }
  }
  return '';
}

// ---------- Mengambil gambar halaman dari preview yang sedang tampil ----------

function swapImageSrc(img: HTMLImageElement, url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onLoad = () => {
      img.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      img.removeEventListener('load', onLoad);
      reject(new Error('Gagal memuat foto asli'));
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = url;
  });
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
    )
  );
}

const A4_W_MM = 210;
const A4_H_MM = 297;

/**
 * "Screenshot" setiap elemen .pdf-page di dalam `root`. Sama seperti
 * generatePdfFromElement: foto yang punya versi asli diganti SEMENTARA ke
 * versi resolusi penuh sebelum discreenshot, lalu dikembalikan lagi.
 */
export async function captureSectionPages(
  root: HTMLElement,
  quality: QualitySetting,
  onProgress?: (done: number, total: number) => void
): Promise<BundlePage[]> {
  const pageEls = Array.from(root.querySelectorAll('.pdf-page')) as HTMLElement[];
  if (pageEls.length === 0) throw new Error('Tidak ada halaman untuk disimpan');

  await whenTrackerIdle();

  const imgEls = Array.from(root.querySelectorAll('img[data-evidence-id]')) as HTMLImageElement[];
  const previousSrc = new Map<HTMLImageElement, string>();
  const objectUrls: string[] = [];
  const pages: BundlePage[] = [];

  try {
    for (const img of imgEls) {
      const original = findOriginal(img.src);
      if (!original) continue; // tidak ketemu: pakai gambar preview apa adanya
      previousSrc.set(img, img.src);
      const url = URL.createObjectURL(original);
      objectUrls.push(url);
      await swapImageSrc(img, url);
    }
    await waitForImages(root);

    for (let i = 0; i < pageEls.length; i++) {
      onProgress?.(i, pageEls.length);
      const canvas = await html2canvas(pageEls[i], {
        scale: quality.scale,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const img = canvas.toDataURL('image/jpeg', quality.jpeg);

      let w = A4_W_MM;
      let h = (canvas.height * w) / canvas.width;
      if (h > A4_H_MM) {
        h = A4_H_MM;
        w = (canvas.width * h) / canvas.height;
      }
      pages.push({ img, x: (A4_W_MM - w) / 2, w, h });
      onProgress?.(i + 1, pageEls.length);
    }
  } finally {
    previousSrc.forEach((src, img) => {
      img.src = src;
    });
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
  }
  return pages;
}

/**
 * Gabungkan semua bagian yang sudah tersimpan (urut sesuai `orderedModes`,
 * yaitu urutan menu: Cover sampai Lampiran KML) jadi satu file PDF.
 * Bagian yang belum disimpan otomatis dilewati.
 */
export function mergeBundleToPdf(builderId: string, orderedModes: string[], fileName: string): number {
  const m = bundles.get(builderId);
  if (!m || m.size === 0) throw new Error('Paket masih kosong');

  const pdf = new jsPDF('p', 'mm', 'a4');
  let pageCount = 0;
  for (const mode of orderedModes) {
    const entry = m.get(mode);
    if (!entry) continue;
    for (const p of entry.pages) {
      if (pageCount > 0) pdf.addPage();
      pdf.addImage(p.img, 'JPEG', p.x, 0, p.w, p.h);
      pageCount++;
    }
  }
  if (pageCount === 0) throw new Error('Paket masih kosong');
  pdf.save(fileName);
  return pageCount;
}