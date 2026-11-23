import { DISTRICTS } from '../config/districts';
import '../assets/style_District.css';

interface DistrictSelectProps {
  value: string;
  onChange: (value: string) => void;
}

/** Dropdown pilihan District. Dipakai di semua form menggantikan kolom ketik. */
export default function DistrictSelect({ value, onChange }: DistrictSelectProps) {
  // Kalau ada isian lama yang tidak ada di daftar, tetap ditampilkan (tidak hilang diam-diam)
  const isCustom = value !== '' && !(DISTRICTS as readonly string[]).includes(value);

  return (
    <select className="district-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih district</option>
      {isCustom && <option value={value}>{value}</option>}
      {DISTRICTS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}