import { compressImage } from '../utils/imageCompress';
import type { SignParty } from './DualSignBlock';
import '../assets/style_Evidence.css';
import '../assets/style_DualSign.css';

interface DualSignFieldsProps {
  /** Awalan id input, supaya tidak bentrok antar form */
  idPrefix: string;
  left: SignParty;
  right: SignParty;
  onLeftChange: (patch: Partial<SignParty>) => void;
  onRightChange: (patch: Partial<SignParty>) => void;
}

/**
 * Isian untuk blok tanda tangan DUA PIHAK (khusus BAUT): nama, NIK, dua baris jabatan, dan foto tanda
 * tangan (opsional) untuk pihak kiri dan pihak kanan. Tanggal & kota diisi terpisah di form pemakainya
 * (keduanya muncul di atas pihak kanan).
 */
export default function DualSignFields({ idPrefix, left, right, onLeftChange, onRightChange }: DualSignFieldsProps) {
  const handleFile = async (file: File | null, onChange: (patch: Partial<SignParty>) => void) => {
    if (!file) return;
    try {
      onChange({ signatureDataUrl: await compressImage(file) });
    } catch (err) {
      console.error(err);
      alert(`Foto tanda tangan "${file.name}" tidak bisa dibuka. Pastikan formatnya JPG atau PNG.`);
    }
  };

  const group = (
    key: 'kiri' | 'kanan',
    title: string,
    desc: string,
    party: SignParty,
    onChange: (patch: Partial<SignParty>) => void
  ) => (
    <div className="dsign-group">
      <p className="dsign-group-title">{title}</p>
      <p className="dsign-group-desc">{desc}</p>
      <div className="evidence-form-fields">
        <label>
          Nama Penandatangan
          <input type="text" value={party.nama} onChange={(e) => onChange({ nama: e.target.value })} placeholder="Ketik disini" />
        </label>
        <label>
          NIK
          <input type="text" value={party.nik} onChange={(e) => onChange({ nik: e.target.value })} placeholder="Ketik disini" />
        </label>
        <label>
          Jabatan — Baris 1
          <input type="text" value={party.jabatanBaris1} onChange={(e) => onChange({ jabatanBaris1: e.target.value })} />
        </label>
        <label>
          Jabatan — Baris 2
          <input type="text" value={party.jabatanBaris2} onChange={(e) => onChange({ jabatanBaris2: e.target.value })} />
        </label>
      </div>
      <div className="evidence-heading-field">
        <label htmlFor={`${idPrefix}-sign-${key}`}>Tanda Tangan (opsional, foto atau scan)</label>
        <input
          id={`${idPrefix}-sign-${key}`}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = '';
            handleFile(f, onChange);
          }}
        />
        {party.signatureDataUrl && <img src={party.signatureDataUrl} alt={`Pratinjau tanda tangan ${key}`} className="dsign-preview" />}
      </div>
    </div>
  );

  return (
    <>
      {group('kiri', 'Penandatangan Kiri', 'Pihak pertama di sisi kiri (tanpa kota dan tanggal).', left, onLeftChange)}
      {group('kanan', 'Penandatangan Kanan', 'Pihak kedua di sisi kanan; kota dan tanggal tampil di atas jabatannya.', right, onRightChange)}
    </>
  );
}
