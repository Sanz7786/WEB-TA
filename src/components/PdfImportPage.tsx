import '../assets/style_Evidence.css';
import '../assets/style_PdfImport.css';

interface PdfImportPageProps {
  /** Satu halaman dari PDF yang diimpor, sudah berupa gambar (data URL) */
  imageDataUrl: string;
  imageAlt: string;
}

/**
 * Satu halaman dokumen PDF yang diimpor (NDE, BA Tambah Kurang, BA ABD).
 *
 * Beda dari OtdrPage: dokumen-dokumen ini SUDAH lengkap dengan kop dan isinya
 * sendiri (surat/berita acara yang sudah ditandatangani), jadi aplikasi TIDAK
 * menambah header, judul, atau tabel info proyek. Halaman aslinya ditampilkan
 * penuh apa adanya, satu halaman PDF = satu halaman hasil.
 *
 * Tetap memakai class `.pdf-page` supaya ikut terambil oleh unduhan per bagian
 * (utils/pdfFromElement.ts) dan Paket PDF Lengkap (utils/pdfBundle.ts) tanpa
 * perubahan apa pun di kedua fitur itu.
 */
export default function PdfImportPage({ imageDataUrl, imageAlt }: PdfImportPageProps) {
  return (
    <div className="pdf-page pdf-import-page">
      <img src={imageDataUrl} alt={imageAlt} />
    </div>
  );
}
