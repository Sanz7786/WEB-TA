import { useState } from 'react';
import MainLayout from './MainLayout';
import PdfImportPage from './PdfImportPage';
import { QUALITY_PRESETS, buildPdfFileName, type PdfQuality } from './ExportOptions';
import { generatePdfFromElement } from '../utils/pdfFromElement';
import { isPdfFile, renderPdfToImages } from '../utils/pdfImport';
import { useSharedProject } from '../utils/projectStore';
import '../assets/style_Evidence.css';
import '../assets/style_ExportOptions.css';
import '../assets/style_PdfImport.css';

interface PdfImportFormProps {
  /** 'BAUT' — dipakai untuk nama file yang diunduh */
  docTitle: string;
  /** Judul yang tampil di kop halaman aplikasi, mis. "Buat BAUT — NDE" */
  pageTitle: string;
  /** 'baut-builder' — supaya sidebar menyorot menu yang benar */
  activeMenu: string;
  /** Nama bagian seperti di menu, mis. "NDE" / "BA Tambah Kurang" / "BA ABD" */
  sectionLabel: string;
  /** Penanda di nama file unduhan (tanpa spasi), mis. "NDE" / "BA_Tambah_Kurang" */
  fileTag: string;
}

/** Satu halaman dari PDF yang diimpor, sudah berupa gambar. */
interface ImportedPage {
  id: string;
  /** Nama file sumber (+ nomor halaman kalau PDF-nya lebih dari satu halaman) */
  name: string;
  /** Nama file sumber saja, tanpa ekstensi (cadangan untuk nama file unduhan) */
  source: string;
  preview: string;
}

/** Batas halaman yang diimpor sekaligus, supaya browser tidak kehabisan memori. */
const MAX_PAGES = 80;
/** Halaman penuh dirender lebih tajam daripada gambar hasil ukur (teks surat/BA kecil). */
const RENDER_OPTIONS = { trim: false, scale: 3, format: 'jpeg', jpegQuality: 0.92, maxSide: 3400 } as const;

let idCounter = 0;
const newId = () => `${Date.now()}-${idCounter++}`;
const byName = (a: File, b: File) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const stripExt = (name: string) => name.replace(/\.pdf$/i, '');

/**
 * Form generik "Import PDF" untuk dokumen yang SUDAH jadi dan hanya perlu
 * dimasukkan apa adanya ke paket BAUT: NDE, BA Tambah Kurang, dan BA ABD.
 * Ketiganya memakai komponen yang sama; dibedakan lewat props (lihat BuatBaut.tsx).
 *
 * Alur: pilih file PDF -> tiap halamannya dirender jadi gambar -> atur urutan /
 * hapus halaman -> Lihat Preview -> unduh per bagian, atau "Simpan & lanjut"
 * lewat Paket PDF Lengkap (BundleBar di MainLayout, tanpa perubahan).
 */
export default function PdfImportForm({
  docTitle,
  pageTitle,
  activeMenu,
  sectionLabel,
  fileTag,
}: PdfImportFormProps) {
  // Hanya dibaca untuk nama file (Lokasi/Proyek kalau sudah diisi di Cover); form ini tidak meminta data proyek.
  const [project] = useSharedProject();

  const [items, setItems] = useState<ImportedPage[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [mode, setMode] = useState<'form' | 'preview'>('form');
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState<PdfQuality>('standar');
  const [fileName, setFileName] = useState('');

  // ---------- Impor file PDF ----------
  const handleImport = async (fileList: File[]) => {
    if (loading) return;

    const pdfs = fileList.filter(isPdfFile).sort(byName);
    const notPdf = fileList.filter((f) => !isPdfFile(f));
    if (pdfs.length === 0) {
      alert(`Pilih file PDF ${sectionLabel}. Format lain tidak bisa diimpor di sini.`);
      return;
    }

    const added: ImportedPage[] = [];
    const problems: string[] = notPdf.map((f) => `${f.name}: bukan file PDF`);

    for (const file of pdfs) {
      try {
        setLoading(`Membaca ${file.name}...`);
        const pages = await renderPdfToImages(
          file,
          (done, total) => setLoading(`${file.name}: halaman ${done} dari ${total}...`),
          RENDER_OPTIONS
        );
        pages.forEach((preview, i) =>
          added.push({
            id: newId(),
            name: pages.length > 1 ? `${file.name} — hal ${i + 1}` : file.name,
            source: stripExt(file.name),
            preview,
          })
        );
      } catch (err) {
        console.error(err);
        problems.push(`${file.name}: tidak bisa dibuka (file rusak, diberi password, atau bukan PDF yang valid)`);
      }
    }
    setLoading(null);

    let accepted = added;
    const room = MAX_PAGES - items.length;
    if (added.length > room) {
      accepted = added.slice(0, Math.max(0, room));
      problems.push(`Hanya ${MAX_PAGES} halaman yang bisa diimpor sekaligus; ${added.length - accepted.length} halaman dilewati`);
    }
    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
    if (problems.length > 0) alert(`Sebagian file dilewati:\n\n${problems.map((p) => `• ${p}`).join('\n')}`);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const clearItems = () => {
    if (window.confirm(`Hapus semua halaman ${sectionLabel} yang sudah diimpor?`)) setItems([]);
  };

  const handlePreview = () => {
    if (items.length === 0) {
      alert(`Mohon impor file PDF ${sectionLabel} terlebih dahulu.`);
      return;
    }
    setMode('preview');
  };

  const handleDownload = async () => {
    setIsProcessing(true);
    try {
      const safeName = (project.lokasi || project.proyek || items[0]?.source || 'dokumen')
        .trim()
        .replace(/\s+/g, '_');
      await generatePdfFromElement(
        'pdf-import-content',
        buildPdfFileName({ fileName }, `${docTitle}_${fileTag}_${safeName}`),
        {},
        undefined,
        QUALITY_PRESETS[quality]
      );
    } catch (err) {
      console.error(err);
      alert('Gagal membuat PDF, coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (mode === 'preview') {
    return (
      <MainLayout pageTitle={pageTitle} activeMenu={activeMenu}>
        <div className="evidence-preview-actions">
          <button className="evidence-btn-secondary" onClick={() => setMode('form')}>
            ← Kembali Edit
          </button>
          <button className="evidence-submit-btn" onClick={handleDownload} disabled={isProcessing}>
            {isProcessing ? 'Memproses...' : `Unduh ${sectionLabel} ${docTitle} (PDF)`}
          </button>
        </div>

        {/* Panel opsi berada DI LUAR div ber-id pdf-..., jadi tidak ikut masuk PDF.
            Tanpa opsi logo: halaman ini tidak punya kop buatan aplikasi. */}
        <details className="export-options" open>
          <summary>Opsi Export PDF</summary>
          <div className="export-options-grid">
            <label>
              Kualitas PDF
              <select value={quality} onChange={(e) => setQuality(e.target.value as PdfQuality)}>
                {(Object.keys(QUALITY_PRESETS) as PdfQuality[]).map((q) => (
                  <option key={q} value={q}>
                    {QUALITY_PRESETS[q].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nama file (opsional)
              <input
                type="text"
                value={fileName}
                placeholder="Kosong = otomatis"
                onChange={(e) => setFileName(e.target.value)}
              />
            </label>
            <p className="export-options-hint">
              Isi dokumen ditampilkan apa adanya dari PDF yang diimpor, tanpa header tambahan.
            </p>
          </div>
        </details>

        <div id="pdf-import-content">
          {items.map((it, i) => (
            <div key={it.id}>
              <PdfImportPage imageDataUrl={it.preview} imageAlt={`${sectionLabel} halaman ${i + 1}`} />
              {i < items.length - 1 && <div className="pdf-page-gap">— Akhir Halaman {i + 1} —</div>}
            </div>
          ))}
        </div>
      </MainLayout>
    );
  }

  const inputId = `pdf-import-upload-${fileTag}`;

  return (
    <MainLayout pageTitle={pageTitle} activeMenu={activeMenu}>
      <div className="evidence-form">
        <div className="evidence-heading-field">
          <label htmlFor={inputId}>Impor PDF {sectionLabel}</label>
          <label
            htmlFor={inputId}
            className={`pdfimp-upload-box${isDragging ? ' dragging' : ''}${loading ? ' busy' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleImport(Array.from(e.dataTransfer.files));
            }}
          >
            <span className="evidence-upload-icon">⬆</span>
            <span className="evidence-upload-text">
              {loading ?? `Klik untuk pilih file PDF ${sectionLabel}, atau seret dan lepas ke sini`}
            </span>
            <span className="pdfimp-upload-hint">
              Setiap halaman PDF dimasukkan apa adanya (tanpa header tambahan), satu halaman PDF menjadi satu
              halaman hasil. Boleh memilih beberapa file sekaligus.
            </span>
          </label>
          <input
            id={inputId}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="evidence-upload-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              handleImport(files);
            }}
          />

          {items.length > 0 && (
            <>
              <div className="pdfimp-toolbar">
                <span>{items.length} halaman akan dicetak. Atur urutannya dengan tombol ← →.</span>
                <button type="button" className="pdfimp-clear" onClick={clearItems}>
                  Hapus semua
                </button>
              </div>

              <div className="pdfimp-thumbs">
                {items.map((it, i) => (
                  <div key={it.id} className="pdfimp-thumb">
                    <span className="pdfimp-thumb-number">{i + 1}</span>
                    <img src={it.preview} alt={`${sectionLabel} halaman ${i + 1}`} />
                    <div className="pdfimp-thumb-name" title={it.name}>
                      {it.name}
                    </div>
                    <div className="pdfimp-thumb-actions">
                      <button
                        type="button"
                        className="pdfimp-thumb-btn"
                        title="Geser ke kiri"
                        disabled={i === 0}
                        onClick={() => moveItem(i, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="pdfimp-thumb-btn"
                        title="Geser ke kanan"
                        disabled={i === items.length - 1}
                        onClick={() => moveItem(i, 1)}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="pdfimp-thumb-btn remove"
                        title="Hapus halaman ini"
                        onClick={() => removeItem(it.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="evidence-submit-btn" onClick={handlePreview}>
          Lihat Preview
        </button>
      </div>
    </MainLayout>
  );
}
