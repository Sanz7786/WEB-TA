import MainLayout from '../components/MainLayout';
import PhotoCompressor from '../components/PhotoCompressor';

/**
 * Menu "Kompres Foto" yang berdiri sendiri (terpisah dari Tools LACT & Tools BAUT).
 * Pilih foto -> Kompres Semua -> unduh satu per satu atau ZIP. Tidak ada data proyek, tidak ikut Paket PDF.
 *
 * Catatan: kalau foto di form Lampiran Evidence melebihi batas ukuran, tetap ada alur otomatis yang membuka
 * kompresor di dalam form itu dan mengembalikan hasilnya ke slot evidence asal (lihat EvidenceForm.tsx).
 */
export default function KompresFoto() {
  return (
    <MainLayout activeMenu="kompres-foto" pageTitle="Kompres Foto">
      <PhotoCompressor />
    </MainLayout>
  );
}
