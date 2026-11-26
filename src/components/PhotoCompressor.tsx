import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { compressImage, formatBytes, MAX_ORIGINAL_MB } from '../utils/imageCompress';
import '../assets/style_Kompres.css';

interface PhotoCompressorProps {
  /** Foto yang dilempar otomatis kesini karena ukurannya melebihi batas */
  initialFiles?: File[];
  /**
   * Dipanggil saat user selesai kompres & klik "Gunakan Foto Ini".
   * - Diisi  = dibuka dari form evidence (foto > batas ukuran dialihkan kesini): hasil dikembalikan ke form.
   * - Kosong = menu Kompres Foto yang berdiri sendiri: hasil diunduh (satuan atau ZIP), tidak ada yang "dikembalikan".
   */
  onUse?: (files: File[]) => void;
}

const NO_FILES: File[] = [];

/** Hasil kompres selalu JPEG, jadi nama file diberi akhiran _kompres.jpg */
const compressedName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'foto'}_kompres.jpg`;

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

interface CompressItem {
  id: string;
  originalFile: File;
  originalSize: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  compressedFile?: File;
  compressedSize?: number;
  previewUrl?: string;
}

let idCounter = 0;
const generateId = () => `compress-${Date.now()}-${idCounter++}`;

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
}

export default function PhotoCompressor({ initialFiles = NO_FILES, onUse }: PhotoCompressorProps) {
  const standalone = !onUse;
  const [items, setItems] = useState<CompressItem[]>([]);
  const [zipping, setZipping] = useState(false);

  // Setiap kali ada foto baru dilempar kesini (dari redirect otomatis), tambahkan ke daftar
  useEffect(() => {
    if (initialFiles.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...initialFiles.map((f) => ({
        id: generateId(),
        originalFile: f,
        originalSize: f.size,
        status: 'pending' as const,
      })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    setItems((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: generateId(),
        originalFile: f,
        originalSize: f.size,
        status: 'pending' as const,
      })),
    ]);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleCompressAll = async () => {
    const pendingItems = items.filter((it) => it.status === 'pending' || it.status === 'error');

    for (const it of pendingItems) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'processing' } : p)));
      try {
        // Resolusi & kualitas dijaga tetap tinggi supaya watermark koordinat/tanggal tetap kebaca
        const dataUrl = await compressImage(it.originalFile, 2000, 0.8);
        const compressedFile = await dataUrlToFile(dataUrl, it.originalFile.name);
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id
              ? {
                  ...p,
                  status: 'done',
                  compressedFile,
                  compressedSize: compressedFile.size,
                  previewUrl: dataUrl,
                }
              : p
          )
        );
      } catch (err) {
        console.error(err);
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'error' } : p)));
      }
    }
  };

  const allDone = items.length > 0 && items.every((it) => it.status === 'done');

  const handleUseCompressed = () => {
    const files = items
      .filter((it) => it.status === 'done' && it.compressedFile)
      .map((it) => it.compressedFile as File);
    if (files.length === 0 || !onUse) return;
    onUse(files);
    setItems([]);
  };

  // ---------- Mode mandiri: unduh hasil ----------
  const doneItems = items.filter((it) => it.status === 'done' && it.compressedFile);

  const handleDownloadOne = (it: CompressItem) => {
    if (it.compressedFile) triggerDownload(it.compressedFile, compressedName(it.originalFile.name));
  };

  const handleDownloadZip = async () => {
    if (doneItems.length === 0 || zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const it of doneItems) {
        // Nama kembar (mis. IMG_001.jpg dari folder berbeda) diberi nomor supaya tidak saling menimpa
        const base = compressedName(it.originalFile.name);
        let name = base;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = base.replace(/(\.jpg)$/, `_${n}$1`);
        used.add(name.toLowerCase());
        zip.file(name, it.compressedFile as File);
      }
      // JPEG sudah terkompres, jadi ZIP cukup "menyimpan" (STORE) supaya cepat
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      triggerDownload(blob, 'Foto_Terkompres.zip');
    } catch (err) {
      console.error(err);
      alert('Gagal membuat file ZIP, coba lagi atau unduh satu per satu.');
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="compressor-wrapper">
      {standalone ? (
        <p className="compressor-intro">
          Perkecil ukuran foto beresolusi besar langsung di browser. Pilih foto, klik{' '}
          <strong>Kompres Semua</strong>, lalu unduh hasilnya satu per satu atau semuanya sekaligus (ZIP).
          Resolusi dan kualitas dijaga supaya watermark koordinat dan tanggal tetap terbaca. Foto tidak
          diunggah ke server.
        </p>
      ) : (
        <p className="compressor-intro">
          Foto di bawah ini berukuran lebih dari {MAX_ORIGINAL_MB} MB, jadi perlu dikompres dulu
          sebelum bisa dipakai. Klik <strong>Kompres Semua</strong>, lalu klik{' '}
          <strong>Gunakan Foto Ini</strong> untuk memasukkannya ke daftar evidence
          (masuk ke menu Upload Sekaligus).
        </p>
      )}

      <label htmlFor="compressor-file-input" className="evidence-upload-box compressor-add-box">
        <span className="evidence-upload-icon">⬆</span>
        <span className="evidence-upload-text">
          {standalone && items.length === 0 ? 'Klik untuk memilih foto yang akan dikompres' : 'Tambah foto lain untuk dikompres'}
        </span>
      </label>
      <input
        id="compressor-file-input"
        type="file"
        accept="image/*"
        multiple
        className="evidence-upload-input"
        onChange={(e) => {
          handleAddFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {items.length > 0 && (
        <>
          <div className="compressor-toolbar">
            <button type="button" className="evidence-submit-btn" onClick={handleCompressAll}>
              Kompres Semua
            </button>
            {standalone ? (
              <button
                type="button"
                className="evidence-btn-secondary"
                onClick={handleDownloadZip}
                disabled={doneItems.length === 0 || zipping}
              >
                {zipping ? 'Membuat ZIP...' : `Unduh Semua (ZIP)${doneItems.length ? ` · ${doneItems.length} foto` : ''}`}
              </button>
            ) : (
              <button
                type="button"
                className="evidence-btn-secondary"
                onClick={handleUseCompressed}
                disabled={!allDone}
              >
                Gunakan Foto Ini →
              </button>
            )}
          </div>

          <div className="compressor-list">
            {items.map((it) => (
              <div key={it.id} className="compressor-item">
                <button
                  type="button"
                  className="evidence-remove-btn"
                  onClick={() => handleRemove(it.id)}
                  title="Hapus"
                >
                  ×
                </button>

                {it.previewUrl ? (
                  <img src={it.previewUrl} alt={it.originalFile.name} className="compressor-thumb" />
                ) : (
                  <div className="compressor-thumb compressor-thumb-empty">
                    {it.status === 'processing' ? 'Memproses...' : 'Menunggu'}
                  </div>
                )}

                <p className="compressor-filename">{it.originalFile.name}</p>
                <p className="compressor-size">
                  {formatBytes(it.originalSize)}
                  {it.compressedSize ? ` → ${formatBytes(it.compressedSize)}` : ''}
                </p>
                {standalone && it.status === 'done' && (
                  <button type="button" className="compressor-download-btn" onClick={() => handleDownloadOne(it)}>
                    Unduh
                  </button>
                )}
                {it.status === 'error' && <p className="compressor-error">Gagal dikompres. Klik Kompres Semua untuk mencoba lagi.</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}