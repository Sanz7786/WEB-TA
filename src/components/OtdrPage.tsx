import PdfHeader from './PdfHeader';
import type { LogoSize } from '../config/brand';
import type { ProjectData } from '../types/evidence';
import '../assets/style_Evidence.css';
import '../assets/style_Otdr.css';

interface OtdrPageProps {
  showLogos: boolean;
  logoSize: LogoSize;
  titleLine1: string; // mis. "LAMPIRAN HASIL UKUR OTDR"
  titleLine2: string; // mis. "PROJECT OUTSIDE PLANT FIBER OPTIC"
  project: ProjectData;
  /** Id unik halaman ini. Dipakai sebagai data-evidence-id supaya foto yang diimpor bisa diganti ke versi ASLI saat export. */
  imageId: string;
  /** Isi halaman: satu halaman hasil OTDR yang diimpor (gambar) */
  imageDataUrl: string | null;
  imageAlt: string;
  /** Penomoran halaman; nomor hanya tampil kalau totalPages > 1 */
  pageNumber: number;
  totalPages: number;
}

/**
 * Satu halaman Import OTDR: kita hanya menyediakan HEADER (kop + judul + tabel
 * info proyek); seluruh isi di bawahnya adalah hasil OTDR yang diimpor dari
 * aplikasi OTDR (laporan "Report OTDR"). Kalau yang diimpor beberapa halaman,
 * tiap halaman diberi header yang sama.
 */
export default function OtdrPage({
  showLogos,
  logoSize,
  titleLine1,
  titleLine2,
  project,
  imageId,
  imageDataUrl,
  imageAlt,
  pageNumber,
  totalPages,
}: OtdrPageProps) {
  return (
    <div className="pdf-page pdf-otdr-page">
      <PdfHeader showLogos={showLogos} logoSize={logoSize} />

      <h1 className="pdf-title">
        {titleLine1}
        <br />
        {titleLine2}
      </h1>

      <div className="pdf-info-table">
        <div className="pdf-info-row">
          <span className="pdf-info-label">PROYEK</span>
          <span>: {project.proyek}</span>
        </div>
        <div className="pdf-info-row">
          <span className="pdf-info-label">KONTRAK</span>
          <span>: {project.kontrak}</span>
        </div>
        <div className="pdf-info-row">
          <span className="pdf-info-label">SURAT PESANAN</span>
          <span>: {project.suratPesanan}</span>
        </div>
        <div className="pdf-info-row">
          <span className="pdf-info-label">DISTRICT</span>
          <span>: {project.district}</span>
        </div>
        <div className="pdf-info-row">
          <span className="pdf-info-label">LOKASI</span>
          <span>: {project.lokasi}</span>
        </div>
        <div className="pdf-info-row">
          <span className="pdf-info-label">PELAKSANA</span>
          <span>: {project.pelaksana}</span>
        </div>
      </div>

      <div className="pdf-otdr-image-frame">
        {imageDataUrl ? (
          <img src={imageDataUrl} alt={imageAlt} data-evidence-id={imageId} />
        ) : (
          <div className="pdf-otdr-image-placeholder">Belum ada hasil OTDR yang diimpor</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pdf-page-number">
          Halaman {pageNumber} dari {totalPages}
        </div>
      )}
    </div>
  );
}