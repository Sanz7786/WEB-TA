import { useMemo } from 'react';
import { renderTableToImage } from '../utils/xlsxCanvas';
import type { SheetTable } from '../utils/xlsxTable';

interface ExcelTableProps {
  table: SheetTable;
  /** Indeks baris tabel yang ditampilkan di halaman ini */
  rowIndices: number[];
  /** Pengali ukuran supaya lebar tabel pas di halaman */
  zoom: number;
}

/**
 * Menampilkan satu halaman dari sheet Excel (warna, garis, sel gabungan, dan huruf
 * mengikuti file Excel-nya).
 *
 * Tabel digambar langsung ke canvas lalu dipasang sebagai gambar (lihat
 * utils/xlsxCanvas.ts), BUKAN sebagai tabel HTML. Dengan begitu tampilan di layar
 * sama persis dengan hasil di PDF; sebelumnya, tabel HTML yang di-screenshot oleh
 * html2canvas membuat teks tiap baris bergeser dan terpotong di PDF.
 */
export default function ExcelTable({ table, rowIndices, zoom }: ExcelTableProps) {
  const img = useMemo(() => renderTableToImage(table, rowIndices, zoom), [table, rowIndices, zoom]);
  return (
    <div className="xdoc-table" style={{ position: 'relative', width: img.cssWidth, height: img.cssHeight }}>
      <img
        src={img.url}
        alt={table.name}
        draggable={false}
        style={{
          position: 'absolute',
          left: -img.pad,
          top: -img.pad,
          width: img.cssWidth + img.pad * 2,
          height: img.cssHeight + img.pad * 2,
          maxWidth: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
