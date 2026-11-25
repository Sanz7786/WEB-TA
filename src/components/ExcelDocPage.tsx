import type { ReactNode } from 'react';
import PdfHeader from './PdfHeader';
import DualSignBlock, { type SignParty } from './DualSignBlock';
import type { LogoSize } from '../config/brand';
import type { ProjectData } from '../types/evidence';
import { formatTanggalKata, parseDateLocal } from '../utils/terbilang';
import '../assets/style_Evidence.css';
import '../assets/style_ExcelDoc.css';

interface ExcelDocPageProps {
  showLogos: boolean;
  logoSize: LogoSize;
  titleLine1: string;
  /** Baris kedua judul (boleh kosong = judul satu baris) */
  titleLine2?: string;
  project: ProjectData;
  /** Isi halaman: tabel Excel atau gambar */
  children: ReactNode;
  pageNumber: number;
  totalPages: number;
  /** Blok tanda tangan (hanya dipakai kalau showSign) */
  showSign: boolean;
  tanggalISO: string;
  nama: string;
  nik: string;
  jabatanBaris1: string;
  jabatanBaris2: string;
  kota: string;
  signatureDataUrl: string | null;
  /**
   * Khusus BAUT: kalau diisi, blok tanda tangan tampil DUA PIHAK (ini = pihak kiri; nama/NIK/jabatan/tanda
   * tangan di atas = pihak kanan). Kosong = satu penandatangan seperti biasa (LACT).
   */
  leftParty?: SignParty;
}

/**
 * Satu halaman dokumen BOQ / Data Pengukuran OPM / Lampiran Mancore:
 * header yang SAMA seperti halaman lain (logo, judul, tabel info proyek),
 * isi (tabel Excel atau gambar), lalu blok tanda tangan bila diaktifkan.
 */
export default function ExcelDocPage({
  showLogos,
  logoSize,
  titleLine1,
  titleLine2,
  project,
  children,
  pageNumber,
  totalPages,
  showSign,
  tanggalISO,
  nama,
  nik,
  jabatanBaris1,
  jabatanBaris2,
  kota,
  signatureDataUrl,
  leftParty,
}: ExcelDocPageProps) {
  const tgl = parseDateLocal(tanggalISO);
  const tglSingkat = tgl ? formatTanggalKata(tgl).singkat : '…';

  return (
    <div className="pdf-page pdf-xdoc-page">
      <PdfHeader showLogos={showLogos} logoSize={logoSize} />

      <h1 className="pdf-title">
        {titleLine1}
        {titleLine2 ? (
          <>
            <br />
            {titleLine2}
          </>
        ) : null}
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

      <div className="pdf-xdoc-frame">{children}</div>

      {showSign && leftParty && (
        <DualSignBlock
          tanggalISO={tanggalISO}
          kota={kota}
          left={leftParty}
          right={{ nama, nik, jabatanBaris1, jabatanBaris2, signatureDataUrl }}
        />
      )}

      {showSign && !leftParty && (
        <div className="pdf-xdoc-sign-wrap">
          <div className="pdf-xdoc-sign-block">
            <p>
              {kota || '…'}, {tglSingkat}
            </p>
            <p>{jabatanBaris1}</p>
            <p>{jabatanBaris2}</p>
            <div className="pdf-xdoc-sign-space">
              {signatureDataUrl && <img src={signatureDataUrl} alt="Tanda tangan" />}
            </div>
            <p className="pdf-xdoc-sign-name">{nama}</p>
            <p>NIK. {nik}</p>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pdf-page-number">
          Halaman {pageNumber} dari {totalPages}
        </div>
      )}
    </div>
  );
}