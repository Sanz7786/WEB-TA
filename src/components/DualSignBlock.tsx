import { formatTanggalKata, parseDateLocal } from '../utils/terbilang';
import '../assets/style_DualSign.css';

/** Satu penandatangan (satu kolom) pada blok tanda tangan dua pihak. */
export interface SignParty {
  nama: string;
  nik: string;
  jabatanBaris1: string;
  jabatanBaris2: string;
  /** Foto/scan tanda tangan (opsional) */
  signatureDataUrl: string | null;
}

/** Isian awal sesuai contoh dokumen BAUT: pihak kiri = Telkom Infrastruktur Indonesia. */
export const DEFAULT_LEFT_PARTY: SignParty = {
  nama: '',
  nik: '',
  jabatanBaris1: 'PT. TELKOM INFRASTRUKTUR INDONESIA, Tbk.',
  jabatanBaris2: 'TIM UJI TERIMA',
  signatureDataUrl: null,
};

/** Isian awal sesuai contoh dokumen BAUT: pihak kanan = Telkom Akses (berikut kota & tanggal di atasnya). */
export const DEFAULT_RIGHT_PARTY: SignParty = {
  nama: '',
  nik: '',
  jabatanBaris1: 'PT. TELKOM AKSES',
  jabatanBaris2: 'TIM UJI TERIMA',
  signatureDataUrl: null,
};

interface DualSignBlockProps {
  tanggalISO: string;
  kota: string;
  left: SignParty;
  right: SignParty;
}

/**
 * Blok tanda tangan DUA PIHAK (khusus BAUT): kiri dan kanan sejajar, seperti contoh dokumen.
 * Baris "KOTA, TANGGAL" hanya di atas pihak kanan; di kiri diberi baris kosong setinggi sama supaya
 * jabatan, ruang tanda tangan, nama, dan NIK kedua pihak tetap sejajar.
 *
 * Dipakai oleh BeritaAcaraPage dan ExcelDocPage (BOQ, Data Pengukuran OPM, Lampiran Mancore).
 */
export default function DualSignBlock({ tanggalISO, kota, left, right }: DualSignBlockProps) {
  const tgl = parseDateLocal(tanggalISO);
  const tanggal = tgl ? formatTanggalKata(tgl).singkat : '…';
  const upper = (s: string) => s.toUpperCase();

  const column = (party: SignParty, withDate: boolean) => (
    <div className="pdf-dsign-col">
      <p className="pdf-dsign-date">{withDate ? `${upper(kota.trim()) || '…'}, ${upper(tanggal)}` : ' '}</p>
      <p>{party.jabatanBaris1}</p>
      <p>{party.jabatanBaris2}</p>
      <div className="pdf-dsign-space">
        {party.signatureDataUrl && <img src={party.signatureDataUrl} alt="Tanda tangan" />}
      </div>
      <p className="pdf-dsign-name">{upper(party.nama)}</p>
      <p>NIK. {party.nik}</p>
    </div>
  );

  return (
    <div className="pdf-dsign">
      {column(left, false)}
      {column(right, true)}
    </div>
  );
}
