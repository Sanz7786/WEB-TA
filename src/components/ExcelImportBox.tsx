interface SheetInfo {
  name: string;
  hidden: boolean;
  rows: number;
  cols: number;
  hasPrintArea: boolean;
}

interface ExcelImportBoxProps {
  inputId: string;
  loading: boolean;
  error: string;
  fileName: string;
  sheets: SheetInfo[];
  selected: Set<string>;
  onFiles: (files: File[]) => void;
  onToggle: (sheetName: string) => void;
  onClear: () => void;
}

export type { SheetInfo };

/** Kotak impor Excel: pilih/seret file .xlsx, lalu centang sheet yang mau dipakai. */
export default function ExcelImportBox({
  inputId,
  loading,
  error,
  fileName,
  sheets,
  selected,
  onFiles,
  onToggle,
  onClear,
}: ExcelImportBoxProps) {
  return (
    <div className="xdoc-import">
      <label
        htmlFor={inputId}
        className={`xdoc-dropzone${loading ? ' busy' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="xdoc-dropzone-icon">⬆</span>
        <span className="xdoc-dropzone-title">
          {loading ? 'Membaca file Excel...' : fileName ? 'Ganti file Excel' : 'Klik untuk pilih file Excel (.xlsx), atau seret dan lepas ke sini'}
        </span>
        <span className="xdoc-dropzone-hint">
          Warna, garis, dan sel gabungan mengikuti file Excel. Baris dan kolom yang disembunyikan (termasuk hasil
          filter) tidak ikut ditampilkan.
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="xdoc-file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          onFiles(files);
        }}
      />

      {error && <div className="xdoc-error">{error}</div>}

      {fileName && sheets.length > 0 && (
        <div className="xdoc-sheets">
          <div className="xdoc-sheets-head">
            <span>
              <strong>{fileName}</strong> — pilih sheet yang dipakai (tiap sheet menjadi satu atau lebih halaman)
            </span>
            <button type="button" className="xdoc-link-btn" onClick={onClear}>
              Hapus file
            </button>
          </div>
          {sheets.map((s) => (
            <label key={s.name} className="xdoc-sheet-row">
              <input type="checkbox" checked={selected.has(s.name)} onChange={() => onToggle(s.name)} />
              <span className="xdoc-sheet-name">{s.name}</span>
              <span className="xdoc-sheet-meta">
                {s.cols} kolom × {s.rows} baris
                {s.hasPrintArea ? ' · area cetak Excel dipakai' : ''}
                {s.hidden ? ' · sheet tersembunyi' : ''}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}