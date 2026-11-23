import { useMemo } from 'react';
import { tableToHtml, type SheetTable } from '../utils/xlsxTable';

interface ExcelTableProps {
  table: SheetTable;
  /** Indeks baris tabel yang ditampilkan di halaman ini */
  rowIndices: number[];
  /** Pengali ukuran supaya lebar tabel pas di halaman */
  zoom: number;
}

/**
 * Menampilkan satu halaman dari sheet Excel sebagai tabel HTML sungguhan
 * (warna, garis, sel gabungan, dan huruf mengikuti file Excel-nya).
 * HTML dibuat oleh tableToHtml() dengan semua teks sudah di-escape.
 */
export default function ExcelTable({ table, rowIndices, zoom }: ExcelTableProps) {
  const html = useMemo(() => tableToHtml(table, rowIndices, zoom), [table, rowIndices, zoom]);
  return <div className="xdoc-table" dangerouslySetInnerHTML={{ __html: html }} />;
}