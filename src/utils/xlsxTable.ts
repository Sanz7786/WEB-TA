/**
 * Mengubah satu sheet Excel (SheetModel) menjadi tabel siap tampil:
 *  - hanya baris/kolom yang TIDAK tersembunyi (termasuk baris yang disembunyikan filter),
 *  - hanya area cetak (kalau ada), atau area yang berisi,
 *  - sel gabungan (merge) jadi colSpan/rowSpan,
 *  - tepi kosong dipangkas,
 * lalu bisa dipecah ke beberapa halaman (judul tabel diulang) dan dijadikan HTML.
 */
import { cellKey, type BorderSide, type CellStyle, type Range, type SheetModel } from './xlsxReader';

export interface TableCell {
  text: string;
  isNumber: boolean;
  isCentered: boolean;
  style: CellStyle;
  rowSpan: number;
  colSpan: number;
}

export interface TableRow {
  heightPx: number;
  /** null = sel ini tertutup sel gabungan lain (tidak digambar) */
  cells: (TableCell | null)[];
}

export interface SheetTable {
  name: string;
  colWidths: number[];
  rows: TableRow[];
  totalWidth: number;
  totalHeight: number;
  /** Baris judul tabel yang diulang di tiap halaman: [dari, sampai] (indeks baris tabel) */
  repeatRows: [number, number] | null;
  /**
   * Opsional. Baris dari indeks ini sampai akhir tabel dijaga SATU halaman (tidak dipotong), mis. grup
   * data terakhir + garis bawah bingkai + blok tanda tangan, supaya tanda tangan tidak sendirian di
   * halaman baru. Diisi oleh prepareOpmTable().
   */
  keepTogetherFrom?: number;
}

const isWhite = (c?: string) => !c || c.toUpperCase() === '#FFFFFF';
const hasBorder = (s: CellStyle) => !!(s.top || s.right || s.bottom || s.left);
const cellHasContent = (c: TableCell) => c.text.trim() !== '' || !isWhite(c.style.fill) || hasBorder(c.style);

export function buildSheetTable(sheet: SheetModel): SheetTable | null {
  const range: Range | null | undefined = sheet.printArea ?? sheet.used;
  if (!range) return null;

  const rowsSrc: number[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    if (sheet.hiddenRows.has(r)) continue;
    rowsSrc.push(r);
  }
  const colsSrc: number[] = [];
  for (let c = range.c1; c <= range.c2; c++) {
    if (sheet.hiddenCols.has(c)) continue;
    colsSrc.push(c);
  }
  if (rowsSrc.length === 0 || colsSrc.length === 0) return null;

  const rowIdx = new Map(rowsSrc.map((r, i) => [r, i]));
  const colIdx = new Map(colsSrc.map((c, i) => [c, i]));

  // sel dasar (yang tidak ada di file dianggap kosong, memakai gaya baris/kolom bila ada)
  const grid: (TableCell | null)[][] = rowsSrc.map((r) =>
    colsSrc.map((c) => {
      const raw = sheet.cells.get(cellKey(r, c));
      if (raw) {
        return { text: raw.text, isNumber: raw.isNumber, isCentered: raw.isCentered, style: raw.style, rowSpan: 1, colSpan: 1 };
      }
      const st = sheet.rowStyle.get(r) ?? sheet.colStyle.get(c) ?? sheet.baseStyle;
      return { text: '', isNumber: false, isCentered: false, style: st, rowSpan: 1, colSpan: 1 };
    })
  );

  // sel gabungan
  for (const m of sheet.merges) {
    const rr = rowsSrc.filter((r) => r >= m.r1 && r <= m.r2);
    const cc = colsSrc.filter((c) => c >= m.c1 && c <= m.c2);
    if (rr.length === 0 || cc.length === 0) continue;
    const i0 = rowIdx.get(rr[0]) as number;
    const j0 = colIdx.get(cc[0]) as number;
    const top = sheet.cells.get(cellKey(m.r1, m.c1));
    const base = grid[i0][j0] as TableCell;

    // garis tepi sel gabungan diambil dari sel-sel di tepinya
    const edge = (r: number, c: number) => sheet.cells.get(cellKey(r, c))?.style;
    const style: CellStyle = {
      ...(top?.style ?? base.style),
      top: edge(m.r1, m.c1)?.top,
      left: edge(m.r1, m.c1)?.left,
      right: edge(m.r1, m.c2)?.right,
      bottom: edge(m.r2, m.c1)?.bottom,
    };
    grid[i0][j0] = {
      text: top?.text ?? base.text,
      isNumber: top?.isNumber ?? false,
      isCentered: top?.isCentered ?? false,
      style,
      rowSpan: rr.length,
      colSpan: cc.length,
    };
    for (let a = 0; a < rr.length; a++) {
      for (let b = 0; b < cc.length; b++) {
        if (a === 0 && b === 0) continue;
        grid[(rowIdx.get(rr[a]) as number)][(colIdx.get(cc[b]) as number)] = null;
      }
    }
  }

  // pangkas tepi kosong (baris/kolom paling luar yang tidak berisi apa-apa)
  let top = grid.length;
  let bottom = -1;
  let left = colsSrc.length;
  let right = -1;
  grid.forEach((row, i) =>
    row.forEach((cell, j) => {
      if (!cell || !cellHasContent(cell)) return;
      const iEnd = i + cell.rowSpan - 1;
      const jEnd = j + cell.colSpan - 1;
      top = Math.min(top, i);
      left = Math.min(left, j);
      bottom = Math.max(bottom, iEnd);
      right = Math.max(right, jEnd);
    })
  );
  if (bottom < 0) return null;

  const rowsKept = rowsSrc.slice(top, bottom + 1);
  const colsKept = colsSrc.slice(left, right + 1);
  const rows: TableRow[] = rowsKept.map((r, ii) => ({
    heightPx: sheet.rowHeightPx.get(r) ?? sheet.defaultRowPx,
    cells: grid[top + ii].slice(left, right + 1).map((cell) => {
      if (!cell) return null;
      // rentang yang melewati tepi pangkasan dipotong
      return cell;
    }),
  }));
  // koreksi span yang keluar dari tepi baru
  rows.forEach((row, i) =>
    row.cells.forEach((cell) => {
      if (!cell) return;
      cell.rowSpan = Math.min(cell.rowSpan, rows.length - i);
    })
  );
  rows.forEach((row) =>
    row.cells.forEach((cell, j) => {
      if (!cell) return;
      cell.colSpan = Math.min(cell.colSpan, colsKept.length - j);
    })
  );

  const colWidths = colsKept.map((c) => sheet.colWidthPx.get(c) ?? sheet.defaultColPx);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalHeight = rows.reduce((a, r) => a + r.heightPx, 0);

  // judul tabel yang diulang tiap halaman
  let repeatRows: [number, number] | null = null;
  if (sheet.repeatRows) {
    const [a, b] = sheet.repeatRows;
    const idxs = rowsKept.map((r, i) => (r >= a && r <= b ? i : -1)).filter((i) => i >= 0);
    if (idxs.length) repeatRows = [idxs[0], idxs[idxs.length - 1]];
  }
  if (!repeatRows) repeatRows = detectHeaderRows(rows);

  dedupeBorders(rows);

  return { name: sheet.name, colWidths, rows, totalWidth, totalHeight, repeatRows };
}

/**
 * Garis yang dipakai bersama dua sel bersebelahan (garis kanan sel kiri = garis kiri sel kanan)
 * hanya digambar SEKALI. Browser menggabungkannya sendiri (border-collapse), tapi html2canvas
 * (yang dipakai untuk membuat PDF) menggambar tiap sel terpisah sehingga garisnya jadi dobel tebal.
 */
function dedupeBorders(rows: TableRow[]) {
  const n = rows.length;
  const m = n ? rows[0].cells.length : 0;
  // pemilik tiap posisi (sel yang menutupinya, termasuk sel gabungan)
  const owner: (TableCell | null)[][] = rows.map((r) => r.cells.map((c) => c));
  rows.forEach((row, i) =>
    row.cells.forEach((c, j) => {
      if (!c) return;
      for (let a = 0; a < c.rowSpan; a++)
        for (let b = 0; b < c.colSpan; b++) if (i + a < n && j + b < m) owner[i + a][j + b] = c;
    })
  );
  const cloned = new Set<TableCell>();
  const strip = (cell: TableCell, side: 'top' | 'left' | 'right' | 'bottom') => {
    if (!cloned.has(cell)) {
      cell.style = { ...cell.style };
      cloned.add(cell);
    }
    cell.style[side] = undefined;
  };

  rows.forEach((row, i) =>
    row.cells.forEach((c, j) => {
      if (!c) return;
      // kiri: bandingkan dengan sel di kirinya (baris yang sama)
      const left = j > 0 ? owner[i][j - 1] : null;
      if (left && left !== c && left.style.right && c.style.left) {
        if (left.style.right.width >= c.style.left.width) strip(c, 'left');
        else strip(left, 'right');
      }
      // atas: bandingkan dengan sel di atasnya (kolom yang sama)
      const up = i > 0 ? owner[i - 1][j] : null;
      if (up && up !== c && up.style.bottom && c.style.top) {
        if (up.style.bottom.width >= c.style.top.width) strip(c, 'top');
        else strip(up, 'bottom');
      }
    })
  );
}

/** Tebak baris judul tabel: deretan baris di bagian atas yang sebagian besar selnya berwarna. */
function detectHeaderRows(rows: TableRow[]): [number, number] | null {
  const limit = Math.min(rows.length, 15);
  const isHeaderLike = (row: TableRow) => {
    const cells = row.cells.filter((c): c is TableCell => !!c);
    if (cells.length === 0) return false;
    return cells.filter((c) => !isWhite(c.style.fill)).length / cells.length >= 0.5;
  };
  let start = -1;
  for (let i = 0; i < limit; i++) {
    if (isHeaderLike(rows[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = start;
  while (end + 1 < limit && end - start < 4 && isHeaderLike(rows[end + 1])) end++;
  return [start, end];
}

// ======================= Pemecahan halaman =======================

/**
 * Bagi baris tabel ke beberapa halaman. `capacityPx` = tinggi tabel yang muat
 * di satu halaman (sudah dikali zoom). Sel gabungan tidak dipotong, dan judul
 * tabel diulang di halaman berikutnya. Hasil: daftar indeks baris per halaman.
 */
export function paginateTable(table: SheetTable, zoom: number, capacityPx: number): number[][] {
  const n = table.rows.length;
  // baris yang tertutup sel gabungan dari atas = tidak boleh jadi awal halaman baru
  const blocked = new Array<boolean>(n).fill(false);
  table.rows.forEach((row, i) =>
    row.cells.forEach((cell) => {
      if (cell && cell.rowSpan > 1) for (let k = i + 1; k < i + cell.rowSpan && k < n; k++) blocked[k] = true;
    })
  );

  // Bagian ekor (grup terakhir + garis bawah bingkai + tanda tangan) dijaga satu halaman: baris-baris
  // sesudah awalnya tidak boleh jadi awal halaman baru, dan grup yang dimulai di awalnya meluas sampai akhir.
  const tail = table.keepTogetherFrom ?? -1;
  if (tail >= 0) for (let k = tail + 1; k < n; k++) blocked[k] = true;

  const h = (i: number) => table.rows[i].heightPx * zoom;

  // Satu "grup" = deretan baris yang terikat sel gabungan (mis. 8 baris core milik satu ODP).
  // Grup tidak boleh dipotong, jadi muat-tidaknya dihitung dari TINGGI SELURUH GRUP, bukan baris pertamanya
  // saja. Kalau tidak, grup yang baris pertamanya masih muat tapi seluruhnya tidak akan "menyangkut" di
  // halaman itu dan membuat halaman melebihi A4.
  const groupEnd = (start: number): number => {
    if (start === tail) return n - 1;
    let end = start;
    for (let k = start; k <= end && k < n; k++) {
      table.rows[k].cells.forEach((cell) => {
        if (cell && cell.rowSpan > 1) end = Math.max(end, Math.min(n - 1, k + cell.rowSpan - 1));
      });
    }
    return end;
  };
  const groupCost = (start: number): number => {
    let sum = 0;
    for (let k = start; k <= groupEnd(start); k++) sum += h(k);
    return sum;
  };

  const rep = table.repeatRows;
  const repIdx = rep ? Array.from({ length: rep[1] - rep[0] + 1 }, (_, k) => rep[0] + k) : [];
  const repH = repIdx.reduce((a, i) => a + h(i), 0);

  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    const cost = h(i);
    const isRepeated = pages.length > 0 && repIdx.includes(i);
    if (isRepeated) continue; // sudah ditambahkan sebagai judul berulang
    if (cur.length > 0 && !blocked[i] && used + groupCost(i) > capacityPx) {
      pages.push(cur);
      cur = pages.length > 0 && repIdx.length && i > repIdx[repIdx.length - 1] ? [...repIdx] : [];
      used = cur.length ? repH : 0;
    }
    cur.push(i);
    used += cost;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

// ======================= Khusus tabel OPM =======================

/** Sel tabel sungguhan = berisi teks DAN punya garis tepi (garis bingkai luar / kotak info yang kosong tidak ikut). */
const isBoxedText = (c: TableCell | null): c is TableCell => !!c && c.text.trim() !== '' && hasBorder(c.style);
/** Baris tabel (judul kolom / data) punya banyak sel berteks+berbingkai; baris info (PROYEK, KONTRAK, ...) paling banyak 1-2. */
const OPM_GRID_MIN_CELLS = 5;
/** Tinggi maksimum (px Excel) baris kosong pembungkus bingkai di atas & bawah tabel, supaya tidak ada celah besar. */
const OPM_FRAME_PAD_PX = 10;

/**
 * Merapikan sheet Data Pengukuran OPM supaya mirip dokumen acuan:
 *  1. Blok info di dalam bingkai Excel (OPERATION WAVE LENGTH, PROYEK, KONTRAK, SURAT PESANAN, DISTRICT, LOKASI,
 *     PELAKSANA) DIBUANG. Informasi itu sudah dicetak aplikasi sebagai header halaman (dari isian form), jadi kalau
 *     ikut tercetak hasilnya dobel dan huruf tabelnya mengecil. Garis atas bingkai luar Excel tetap dipertahankan.
 *  2. Judul kolom (2 baris) diulang di tiap halaman lanjutan, termasuk garis atas bingkai.
 *  3. Grup data terakhir + garis bawah bingkai + blok tanda tangan Excel dijaga satu halaman.
 *  4. Opsi `dropTrailer`: baris SETELAH garis bawah bingkai (blok tanda tangan bawaan Excel) dibuang. Dipakai saat
 *     blok tanda tangan dari form aktif, supaya tidak ada dua blok tanda tangan sekaligus.
 *
 * Kalau sheet tidak punya baris tabel yang dikenali, tabel dikembalikan apa adanya.
 */
export function prepareOpmTable(table: SheetTable, options: { dropTrailer?: boolean } = {}): SheetTable {
  const isGridRow = (row: TableRow) => row.cells.filter(isBoxedText).length >= OPM_GRID_MIN_CELLS;
  const firstGrid = table.rows.findIndex(isGridRow);
  if (firstGrid < 0) return table;
  let lastGrid = table.rows.length - 1;
  while (lastGrid > firstGrid && !isGridRow(table.rows[lastGrid])) lastGrid--;

  const isBlank = (row: TableRow) => row.cells.every((c) => !c || c.text.trim() === '');
  const hasAnyBorder = (row: TableRow) => row.cells.some((c) => !!c && hasBorder(c.style));

  // Baris pertama yang kosong tetapi berbingkai = garis atas bingkai luar Excel: dipertahankan.
  const keepTop = firstGrid > 0 && isBlank(table.rows[0]) && hasAnyBorder(table.rows[0]) ? 1 : 0;
  const removed = firstGrid - keepTop;

  // Salin baris (dan larik sel-nya) supaya tabel asli tidak berubah.
  const rows: TableRow[] = [...table.rows.slice(0, keepTop), ...table.rows.slice(firstGrid)].map((r) => ({
    ...r,
    cells: [...r.cells],
  }));
  const last = lastGrid - removed;
  const m = rows[0].cells.length;

  if (options.dropTrailer) {
    // Pertahankan satu baris pembungkus bingkai di bawah baris data terakhir (garis bawah bingkai), buang sisanya.
    const keepBottom = last + 1 < rows.length && isBlank(rows[last + 1]) && hasAnyBorder(rows[last + 1]) ? 1 : 0;
    rows.length = last + 1 + keepBottom;
  }

  // Sel yang tadinya tertutup sel gabungan dari blok yang dibuang jadi sel kosong biasa (tanpa garis/warna).
  const covered = rows.map(() => new Array<boolean>(m).fill(false));
  rows.forEach((row, i) =>
    row.cells.forEach((c, j) => {
      if (!c) return;
      for (let a = 0; a < c.rowSpan; a++)
        for (let b = 0; b < c.colSpan; b++) if (i + a < rows.length && j + b < m) covered[i + a][j + b] = true;
    })
  );
  const sample = rows.flatMap((r) => r.cells).find((c): c is TableCell => !!c);
  if (sample) {
    const blank: CellStyle = { ...sample.style, fill: undefined, top: undefined, right: undefined, bottom: undefined, left: undefined };
    rows.forEach((row, i) =>
      row.cells.forEach((c, j) => {
        if (!c && !covered[i][j]) row.cells[j] = { text: '', isNumber: false, isCentered: false, style: blank, rowSpan: 1, colSpan: 1 };
      })
    );
  }

  // Baris pembungkus bingkai (atas & bawah) dipendekkan.
  const shrink = (i: number) => {
    if (i >= 0 && i < rows.length) rows[i] = { ...rows[i], heightPx: Math.min(rows[i].heightPx, OPM_FRAME_PAD_PX) };
  };
  if (keepTop) shrink(0);
  if (last + 1 < rows.length && isBlank(rows[last + 1]) && hasAnyBorder(rows[last + 1])) shrink(last + 1);

  // Judul kolom = baris tabel pertama + baris-baris yang tertutup sel gabungannya (mis. "Distribusi ODC" 2 baris).
  let headerEnd = keepTop;
  for (let k = keepTop; k <= headerEnd; k++)
    rows[k].cells.forEach((c) => {
      if (c && c.rowSpan > 1) headerEnd = Math.max(headerEnd, Math.min(rows.length - 1, k + c.rowSpan - 1));
    });

  // Awal grup data terakhir (mis. 8 baris core ODP terakhir): dari sana sampai akhir dijaga satu halaman.
  let keepTogetherFrom: number | undefined;
  if (last < rows.length - 1) {
    let start = last;
    for (let k = headerEnd + 1; k < last; k++) {
      if (rows[k].cells.some((c) => !!c && c.rowSpan > 1 && k + c.rowSpan - 1 >= last)) {
        start = k;
        break;
      }
    }
    keepTogetherFrom = start;
  }

  return {
    ...table,
    rows,
    totalHeight: rows.reduce((a, r) => a + r.heightPx, 0),
    repeatRows: [0, headerEnd],
    keepTogetherFrom,
  };
}

/**
 * Kalau seluruh tabel muat di SATU halaman, tinggi barisnya direnggangkan sedikit (maks. `maxFactor`x) supaya
 * halaman terisi dan tabel terasa lega seperti dokumen acuan. Huruf TIDAK membesar (ukurannya ikut lebar kolom),
 * hanya jarak antarbaris. Kalau tabel lebih dari satu halaman, tinggi aslinya dipertahankan agar tidak menambah halaman.
 */
export function stretchRowsToFit(table: SheetTable, zoom: number, capacityPx: number, maxFactor = 1.25): SheetTable {
  const natural = table.totalHeight * zoom;
  if (natural <= 0 || natural > capacityPx) return table;
  const k = Math.min(maxFactor, (capacityPx * 0.97) / natural); // sisakan 3% sebagai ruang aman
  if (k <= 1.01) return table;
  return {
    ...table,
    rows: table.rows.map((r) => ({ ...r, heightPx: r.heightPx * k })),
    totalHeight: table.totalHeight * k,
  };
}

// ======================= HTML =======================

const esc =(s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const borderCss = (side: string, b: BorderSide | undefined, zoom: number) => {
  if (!b) return '';
  const w = b.kind === 'double' ? Math.max(1.5, 3 * zoom) : Math.max(0.6, b.width * zoom);
  return `border-${side}:${w.toFixed(2)}px ${b.kind} ${b.color};`;
};

function cellHtml(cell: TableCell, zoom: number, ownPx: number, freeLeft: number, freeRight: number): string {
  const s = cell.style;
  const align = s.h === 'general' ? (cell.isNumber ? 'right' : cell.isCentered ? 'center' : 'left') : s.h;
  // 0.96: sedikit ruang napas supaya kata tidak patah di tengah gara-gara beda lebar huruf dengan Excel
  const fontPx = Math.max(4, ((s.sizePt * 4) / 3) * zoom * 0.96);

  // Teks yang tidak dilipat boleh meluber ke sel KOSONG di sebelahnya (seperti Excel):
  // rata kiri -> ke kanan, rata kanan -> ke kiri, rata tengah -> ke kedua sisi.
  // Teks yang bertemu sel terisi terpotong di sel itu.
  let spillLeft = 0;
  let spillRight = 0;
  if (!s.wrap && cell.text !== '' && s.rotation === 0 && !(cell.isNumber && s.h === 'general')) {
    if (align === 'left') spillRight = freeRight;
    else if (align === 'right') spillLeft = freeLeft;
    else if (align === 'center') spillLeft = spillRight = Math.min(freeLeft, freeRight);
  }
  const spill = spillLeft + spillRight > 0.5;
  const css = [
    s.fill ? `background:${s.fill};` : '',
    `color:${s.color ?? '#000000'};`,
    `font-family:'${s.font}',Carlito,Calibri,Arial,sans-serif;`,
    `font-size:${fontPx.toFixed(2)}px;`,
    s.bold ? 'font-weight:700;' : '',
    s.italic ? 'font-style:italic;' : '',
    s.underline || s.strike ? `text-decoration:${[s.underline ? 'underline' : '', s.strike ? 'line-through' : ''].join(' ').trim()};` : '',
    `text-align:${align};`,
    `vertical-align:${s.v};`,
    s.wrap
      ? 'white-space:pre-wrap;overflow:hidden;word-break:break-word;'
      : spill
      ? 'white-space:nowrap;overflow:visible;'
      : 'white-space:nowrap;overflow:hidden;',
    `padding:0 ${(1 * zoom + s.indent * 9 * zoom).toFixed(2)}px 0 ${(1 * zoom + s.indent * 9 * zoom).toFixed(2)}px;`,
    'line-height:1.15;',
    borderCss('top', s.top, zoom),
    borderCss('right', s.right, zoom),
    borderCss('bottom', s.bottom, zoom),
    borderCss('left', s.left, zoom),
  ].join('');
  const text = s.wrap ? esc(cell.text) : esc(cell.text.replace(/\r?\n/g, ' '));
  const inner =
    s.rotation === 90
      ? `<div style="writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;">${text}</div>`
      : spill
      ? `<div style="margin-left:-${spillLeft.toFixed(2)}px;width:${(ownPx + spillLeft + spillRight).toFixed(2)}px;overflow:hidden;white-space:nowrap;text-align:${align};">${text}</div>`
      : text;
  const spans = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''}`;
  return `<td${spans} style="${css}">${inner}</td>`;
}

/** Tabel HTML untuk baris-baris tertentu (satu halaman), dikalikan `zoom`. */
export function tableToHtml(table: SheetTable, rowIndices: number[], zoom: number): string {
  const widths = table.colWidths.map((w) => Math.max(1, Math.round(w * zoom * 100) / 100));
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => `<col style="width:${w}px">`).join('');
  const trs = rowIndices
    .map((i) => {
      const row = table.rows[i];
      const emptyAt = (k: number) => {
        const nb = row.cells[k];
        return !!nb && nb.text === '' && nb.colSpan === 1 && nb.rowSpan === 1;
      };
      const tds = row.cells
        .map((c, j) => {
          if (!c) return '';
          let own = 0;
          for (let k = j; k < j + c.colSpan && k < widths.length; k++) own += widths[k];
          let freeRight = 0;
          for (let k = j + c.colSpan; k < widths.length && emptyAt(k); k++) freeRight += widths[k];
          let freeLeft = 0;
          for (let k = j - 1; k >= 0 && emptyAt(k); k--) freeLeft += widths[k];
          return cellHtml(c, zoom, own, freeLeft, freeRight);
        })
        .join('');
      return `<tr style="height:${(row.heightPx * zoom).toFixed(2)}px">${tds}</tr>`;
    })
    .join('');
  return (
    `<table class="xl-table" style="border-collapse:collapse;table-layout:fixed;width:${total}px;border-spacing:0;">` +
    `<colgroup>${cols}</colgroup><tbody>${trs}</tbody></table>`
  );
}