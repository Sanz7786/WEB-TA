/**
 * Menggambar satu halaman tabel Excel (SheetTable) LANGSUNG ke <canvas>, lalu
 * mengubahnya menjadi gambar PNG.
 *
 * Kenapa tidak lagi memakai tabel HTML + html2canvas?
 * Tabel Excel biasanya lebar sehingga harus diperkecil (zoom ~0,4-0,65) agar muat
 * di halaman A4. Hasilnya huruf kecil dan tinggi baris berupa angka pecahan.
 * Pada kondisi itu html2canvas menaruh teks di tiap sel sekitar setengah baris lebih
 * rendah dari posisi sebenarnya, sehingga teks terpotong atau tertimpa garis sel
 * (tampilan di layar benar, tetapi PDF-nya cacat). Dengan menggambar sendiri ke
 * canvas, posisi teks, garis, dan warna dihitung langsung (tanpa tahap screenshot),
 * jadi hasil di layar dan hasil di PDF sama persis dan tetap tajam.
 *
 * Aturan tampilan sengaja SAMA dengan tableToHtml() di xlsxTable.ts: ukuran huruf,
 * 'ruang napas' 0,96, tinggi baris 1,15, teks yang meluber ke sel kosong di
 * sebelahnya, sel gabungan, teks vertikal, dan tebal garis.
 */
import type { BorderSide } from './xlsxReader';
import type { SheetTable, TableCell } from './xlsxTable';

export interface TableImage {
  /** Gambar PNG (data URL) */
  url: string;
  /** Lebar & tinggi TABEL dalam px layar (tanpa margin pengaman) */
  cssWidth: number;
  cssHeight: number;
  /** Margin pengaman di sekeliling gambar (px layar), supaya garis tepi tidak terpotong */
  pad: number;
}

export interface TableRenderOptions {
  /** Ketajaman gambar (px gambar per px layar). Bawaan 3. */
  scale?: number;
  /** Pembuat canvas (bawaan: document.createElement). Dipakai untuk pengujian di luar browser. */
  makeCanvas?: (w: number, h: number) => HTMLCanvasElement;
}

const PAD_CSS = 2;
const LINE_HEIGHT = 1.15;

const defaultMakeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Pecah teks menjadi baris-baris yang muat di lebar `maxW` (mengikuti font yang sedang aktif di ctx). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  const w = (s: string) => ctx.measureText(s).width;

  // kata yang lebih lebar dari sel dipecah per huruf
  const pushLong = (word: string): string => {
    let chunk = '';
    for (const ch of word) {
      if (chunk && w(chunk + ch) > maxW) {
        out.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    return chunk;
  };

  for (const para of text.split(/\r?\n/)) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (w(test) <= maxW) {
        line = test;
      } else if (line === '') {
        line = pushLong(word);
      } else {
        out.push(line);
        line = w(word) > maxW ? pushLong(word) : word;
      }
    }
    out.push(line);
  }
  return out;
}

export function renderTableToImage(
  table: SheetTable,
  rowIndices: number[],
  zoom: number,
  opts: TableRenderOptions = {}
): TableImage {
  const S = opts.scale ?? 3;
  const makeCanvas = opts.makeCanvas ?? defaultMakeCanvas;

  const nCols = table.colWidths.length;
  const nRows = rowIndices.length;

  // Posisi garis kolom/baris dalam px gambar, dibulatkan ke piksel utuh supaya garis tajam
  const X: number[] = [0];
  table.colWidths.forEach((w) => X.push(X[X.length - 1] + w * zoom * S));
  const Y: number[] = [0];
  rowIndices.forEach((i) => Y.push(Y[Y.length - 1] + table.rows[i].heightPx * zoom * S));
  const Xr = X.map((v) => Math.round(v));
  const Yr = Y.map((v) => Math.round(v));

  const pad = Math.round(PAD_CSS * S);
  const W = Xr[nCols] + pad * 2;
  const H = Yr[nRows] + pad * 2;

  const canvas = makeCanvas(Math.max(1, W), Math.max(1, H));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(pad, pad);

  // Daftar sel beserta kotaknya
  interface Placed {
    cell: TableCell;
    x: number;
    y: number;
    w: number;
    h: number;
    freeLeft: number;
    freeRight: number;
  }
  const placed: Placed[] = [];
  const emptyAt = (p: number, k: number) => {
    const nb = table.rows[rowIndices[p]].cells[k];
    return !!nb && nb.text === '' && nb.colSpan === 1 && nb.rowSpan === 1;
  };
  for (let p = 0; p < nRows; p++) {
    const row = table.rows[rowIndices[p]];
    for (let j = 0; j < nCols; j++) {
      const cell = row.cells[j];
      if (!cell) continue;
      const cs = Math.min(cell.colSpan, nCols - j);
      const rs = Math.min(cell.rowSpan, nRows - p);
      let freeRight = 0;
      for (let k = j + cs; k < nCols && emptyAt(p, k); k++) freeRight += Xr[k + 1] - Xr[k];
      let freeLeft = 0;
      for (let k = j - 1; k >= 0 && emptyAt(p, k); k--) freeLeft += Xr[k + 1] - Xr[k];
      placed.push({
        cell,
        x: Xr[j],
        y: Yr[p],
        w: Xr[j + cs] - Xr[j],
        h: Yr[p + rs] - Yr[p],
        freeLeft,
        freeRight,
      });
    }
  }

  // 1) warna latar
  for (const { cell, x, y, w, h } of placed) {
    if (cell.style.fill) {
      ctx.fillStyle = cell.style.fill;
      ctx.fillRect(x, y, w, h);
    }
  }

  // 2) teks
  for (const pc of placed) drawCellText(ctx, pc, zoom, S);

  // 3) garis tepi (digambar terakhir supaya selalu di atas warna & teks)
  for (const { cell, x, y, w, h } of placed) {
    const s = cell.style;
    drawBorder(ctx, 'h', x, x + w, y, s.top, zoom, S);
    drawBorder(ctx, 'h', x, x + w, y + h, s.bottom, zoom, S);
    drawBorder(ctx, 'v', y, y + h, x, s.left, zoom, S);
    drawBorder(ctx, 'v', y, y + h, x + w, s.right, zoom, S);
  }

  return {
    url: canvas.toDataURL('image/png'),
    cssWidth: Xr[nCols] / S,
    cssHeight: Yr[nRows] / S,
    pad: pad / S,
  };
}

function drawCellText(
  ctx: CanvasRenderingContext2D,
  pc: { cell: TableCell; x: number; y: number; w: number; h: number; freeLeft: number; freeRight: number },
  zoom: number,
  S: number
) {
  const { cell, x, y, w, h } = pc;
  const s = cell.style;
  if (cell.text === '' || w <= 0 || h <= 0) return;

  const fontPx = Math.max(4, ((s.sizePt * 4) / 3) * zoom * 0.96) * S;
  const family = `'${s.font.replace(/'/g, '')}', Carlito, Calibri, Arial, sans-serif`;
  ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700' : '400'} ${fontPx.toFixed(2)}px ${family}`;
  ctx.fillStyle = s.color ?? '#000000';
  ctx.textBaseline = 'alphabetic';

  const align: 'left' | 'center' | 'right' =
    s.h === 'general'
      ? cell.isNumber
        ? 'right'
        : cell.isCentered
        ? 'center'
        : 'left'
      : s.h === 'justify'
      ? 'left'
      : s.h;

  const padX = (1 * zoom + s.indent * 9 * zoom) * S;
  const lineH = fontPx * LINE_HEIGHT;
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? fontPx * 0.9;
  const desc = m.fontBoundingBoxDescent ?? fontPx * 0.25;

  // Teks yang tidak dilipat boleh meluber ke sel KOSONG di sebelahnya (seperti Excel)
  let spillL = 0;
  let spillR = 0;
  if (!s.wrap && s.rotation === 0 && !(cell.isNumber && s.h === 'general')) {
    if (align === 'left') spillR = pc.freeRight;
    else if (align === 'right') spillL = pc.freeLeft;
    else {
      spillL = spillR = Math.min(pc.freeLeft, pc.freeRight);
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x - spillL, y, w + spillL + spillR, h);
  ctx.clip();

  const rotated = s.rotation === 90;
  // Lebar untuk melipat teks: dikurangi setengah tebal garis kiri/kanan (seperti border-collapse di browser)
  const borderPx = (b?: BorderSide) => (b ? Math.max(1, Math.round(Math.max(0.6, b.width * zoom) * S)) : 0);
  const insetX = (borderPx(s.left) + borderPx(s.right)) / 2;
  const availW = rotated ? h - padX * 2 : w - padX * 2 - insetX;
  const lines = s.wrap ? wrapLines(ctx, cell.text, Math.max(1, availW)) : [cell.text.replace(/\r?\n/g, ' ')];
  const block = lines.length * lineH;
  const lineBaseline = (top: number, i: number) => top + i * lineH + (lineH - (asc + desc)) / 2 + asc;

  const decorate = (text: string, startX: number, baseline: number) => {
    if (!s.underline && !s.strike) return;
    const tw = ctx.measureText(text).width;
    const t = Math.max(1, fontPx / 14);
    if (s.underline) ctx.fillRect(startX, baseline + fontPx * 0.1, tw, t);
    if (s.strike) ctx.fillRect(startX, baseline - fontPx * 0.3, tw, t);
  };

  if (rotated) {
    // teks vertikal: dibaca dari bawah ke atas, di tengah sel
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    const top = -block / 2;
    lines.forEach((ln, i) => {
      const bl = lineBaseline(top, i);
      ctx.fillText(ln, 0, bl);
      decorate(ln, -ctx.measureText(ln).width / 2, bl);
    });
  } else {
    const top = s.v === 'top' ? y : s.v === 'bottom' ? y + h - block : y + (h - block) / 2;
    const ax = align === 'left' ? x + padX : align === 'right' ? x + w - padX : x + w / 2;
    ctx.textAlign = align;
    lines.forEach((ln, i) => {
      const bl = lineBaseline(top, i);
      ctx.fillText(ln, ax, bl);
      const tw = ctx.measureText(ln).width;
      decorate(ln, align === 'left' ? ax : align === 'right' ? ax - tw : ax - tw / 2, bl);
    });
  }
  ctx.restore();
}

/**
 * Satu garis tepi. `dir` 'h' = garis mendatar (a..b = x awal..akhir, pos = y),
 * 'v' = garis tegak (a..b = y awal..akhir, pos = x). Garis ditaruh TEPAT di tengah
 * batas sel (seperti border-collapse), dengan tebal bilangan bulat piksel supaya tajam.
 */
function drawBorder(
  ctx: CanvasRenderingContext2D,
  dir: 'h' | 'v',
  a: number,
  b: number,
  pos: number,
  side: BorderSide | undefined,
  zoom: number,
  S: number
) {
  if (!side) return;
  const cssW = side.kind === 'double' ? Math.max(1.5, 3 * zoom) : Math.max(0.6, side.width * zoom);
  const lw = Math.max(1, Math.round(cssW * S));
  const half = Math.floor(lw / 2);
  ctx.fillStyle = side.color;

  const bar = (offset: number, thick: number) => {
    // sedikit diperpanjang di ujung supaya sudut bertemu rapi
    if (dir === 'h') ctx.fillRect(a - half, pos + offset, b - a + half * 2, thick);
    else ctx.fillRect(pos + offset, a - half, thick, b - a + half * 2);
  };

  if (side.kind === 'double') {
    const t = Math.max(1, Math.round(lw / 3));
    bar(-half, t);
    bar(-half + lw - t, t);
    return;
  }
  if (side.kind === 'solid') {
    bar(-half, lw);
    return;
  }
  // putus-putus / titik-titik
  ctx.save();
  ctx.strokeStyle = side.color;
  ctx.lineWidth = lw;
  ctx.setLineDash(side.kind === 'dotted' ? [lw, lw] : [lw * 4, lw * 2]);
  ctx.beginPath();
  const c = pos + (lw % 2 ? 0.5 : 0);
  if (dir === 'h') {
    ctx.moveTo(a, c);
    ctx.lineTo(b, c);
  } else {
    ctx.moveTo(c, a);
    ctx.lineTo(c, b);
  }
  ctx.stroke();
  ctx.restore();
}
