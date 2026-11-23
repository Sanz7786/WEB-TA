/**
 * Pembaca file Excel (.xlsx) langsung di browser, tanpa library Excel besar:
 * hanya memakai JSZip (membuka ZIP) dan DOMParser bawaan browser.
 *
 * Yang dibaca: isi sel (nilai tersimpan dari rumus), tampilan angka/tanggal,
 * warna isi & huruf, garis tepi, perataan, lebar kolom, tinggi baris, sel yang
 * digabung (merge), baris/kolom yang DISEMBUNYIKAN (termasuk hasil filter),
 * area cetak, judul berulang, dan conditional formatting sederhana
 * (mis. sel berisi "OK" otomatis diwarnai biru).
 *
 * Perlu:  npm install jszip
 */
import JSZip from 'jszip';
import { BUILTIN_FORMATS, formatNumberWithCode } from './excelNumFmt';

// ======================= Tipe data =======================

export interface BorderSide {
  width: number;
  kind: 'solid' | 'dashed' | 'dotted' | 'double';
  color: string;
}

export interface CellStyle {
  fill?: string;
  color?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sizePt: number;
  font: string;
  h: 'general' | 'left' | 'center' | 'right' | 'justify';
  v: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  indent: number;
  rotation: number;
  top?: BorderSide;
  right?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
}

export interface RawCell {
  r: number;
  c: number;
  text: string;
  isNumber: boolean;
  isCentered: boolean; // boolean / error: rata tengah bila perataan "general"
  style: CellStyle;
}

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface SheetModel {
  name: string;
  hidden: boolean;
  cells: Map<string, RawCell>;
  rowHeightPx: Map<number, number>;
  hiddenRows: Set<number>;
  rowStyle: Map<number, CellStyle>;
  colWidthPx: Map<number, number>;
  hiddenCols: Set<number>;
  colStyle: Map<number, CellStyle>;
  defaultColPx: number;
  defaultRowPx: number;
  zeroHeightRows: boolean;
  merges: Range[];
  printArea?: Range;
  repeatRows?: [number, number];
  used: Range | null;
  baseStyle: CellStyle;
}

export interface WorkbookModel {
  fileName: string;
  sheets: SheetModel[];
}

export const cellKey = (r: number, c: number) => `${r},${c}`;

// ======================= Utilitas XML =======================

const parseXml = (text: string): Document => new DOMParser().parseFromString(text, 'application/xml');
const kids = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.localName === name);
const kid = (el: Element | undefined, name: string): Element | undefined =>
  el ? Array.from(el.children).find((c) => c.localName === name) : undefined;
const all = (el: Element | Document, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));

export function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = ref.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/);
  return m ? { c: colToNum(m[1]), r: Number(m[2]) } : null;
}

function parseRange(text: string): Range | null {
  const m = text.replace(/\$/g, '').match(/([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?/);
  if (!m) return null;
  const c1 = colToNum(m[1]);
  const r1 = Number(m[2]);
  const c2 = m[3] ? colToNum(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : r1;
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

// ======================= Warna =======================

const INDEXED_DEFAULT = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00',
  '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF',
  '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300',
  '993300', '993366', '333399', '333333',
];

function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let rr: number;
  let gg: number;
  let bb: number;
  if (s === 0) rr = gg = bb = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue2rgb(p, q, h + 1 / 3);
    gg = hue2rgb(p, q, h);
    bb = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return (to(rr) + to(gg) + to(bb)).toUpperCase();
}

interface Palette {
  theme: string[];
  indexed: string[];
}

function resolveColor(node: Element | undefined, pal: Palette): string | undefined {
  if (!node || node.getAttribute('auto') === '1') return undefined;
  const rgb = node.getAttribute('rgb');
  const th = node.getAttribute('theme');
  const idx = node.getAttribute('indexed');
  let hex: string | undefined;
  if (rgb) hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  else if (th !== null) hex = pal.theme[Number(th)];
  else if (idx !== null) hex = pal.indexed[Number(idx)];
  if (!hex) return undefined;
  const tint = Number(node.getAttribute('tint') ?? 0);
  if (tint) hex = applyTint(hex, tint);
  return `#${hex.toUpperCase()}`;
}

function parseTheme(xml: string | undefined): string[] {
  // urutan indeks tema di styles.xml: lt1, dk1, lt2, dk2, accent1-6, hlink, folHlink
  const fallback = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
  if (!xml) return fallback;
  const doc = parseXml(xml);
  const scheme = all(doc, 'clrScheme')[0];
  if (!scheme) return fallback;
  const get = (name: string, fb: string) => {
    const el = kid(scheme, name);
    const c = el ? (el.firstElementChild as Element | null) : null;
    return c ? (c.getAttribute('lastClr') ?? c.getAttribute('val') ?? fb) : fb;
  };
  return [
    get('lt1', 'FFFFFF'), get('dk1', '000000'), get('lt2', 'E7E6E6'), get('dk2', '44546A'),
    get('accent1', '4472C4'), get('accent2', 'ED7D31'), get('accent3', 'A5A5A5'), get('accent4', 'FFC000'),
    get('accent5', '5B9BD5'), get('accent6', '70AD47'), get('hlink', '0563C1'), get('folHlink', '954F72'),
  ];
}

// ======================= Styles =======================

interface Dxf {
  fill?: string;
  color?: string;
  bold?: boolean;
}

interface StyleBook {
  xfs: CellStyle[];
  xfFormat: string[]; // kode format per xf
  dxfs: Dxf[];
}

const BORDER_KIND: Record<string, { width: number; kind: BorderSide['kind'] }> = {
  thin: { width: 1, kind: 'solid' },
  hair: { width: 1, kind: 'dotted' },
  medium: { width: 2, kind: 'solid' },
  thick: { width: 3, kind: 'solid' },
  dashed: { width: 1, kind: 'dashed' },
  mediumDashed: { width: 2, kind: 'dashed' },
  dotted: { width: 1, kind: 'dotted' },
  double: { width: 3, kind: 'double' },
  dashDot: { width: 1, kind: 'dashed' },
  dashDotDot: { width: 1, kind: 'dashed' },
  mediumDashDot: { width: 2, kind: 'dashed' },
  mediumDashDotDot: { width: 2, kind: 'dashed' },
  slantDashDot: { width: 2, kind: 'dashed' },
};

function parseStyles(xml: string, pal: Palette): StyleBook {
  const doc = parseXml(xml);
  const root = doc.documentElement;

  // palet indeks khusus workbook (jarang)
  const custom = all(doc, 'indexedColors')[0];
  if (custom) {
    const list = all(custom, 'rgbColor').map((e) => (e.getAttribute('rgb') ?? '000000FF').slice(2));
    if (list.length) pal.indexed = list;
  }

  const numFmts = new Map<number, string>();
  const nf = kid(root, 'numFmts');
  if (nf) kids(nf, 'numFmt').forEach((e) => numFmts.set(Number(e.getAttribute('numFmtId')), e.getAttribute('formatCode') ?? 'General'));

  const fonts = kids(kid(root, 'fonts') as Element, 'font').map((f) => {
    const u = kid(f, 'u');
    return {
      bold: !!kid(f, 'b') && kid(f, 'b')?.getAttribute('val') !== '0',
      italic: !!kid(f, 'i') && kid(f, 'i')?.getAttribute('val') !== '0',
      strike: !!kid(f, 'strike') && kid(f, 'strike')?.getAttribute('val') !== '0',
      underline: !!u && u.getAttribute('val') !== 'none',
      sizePt: Number(kid(f, 'sz')?.getAttribute('val') ?? 11),
      font: kid(f, 'name')?.getAttribute('val') ?? 'Calibri',
      color: resolveColor(kid(f, 'color'), pal),
    };
  });

  const fills = kids(kid(root, 'fills') as Element, 'fill').map((f) => {
    const p = kid(f, 'patternFill');
    if (p && p.getAttribute('patternType') === 'solid') return resolveColor(kid(p, 'fgColor'), pal);
    const g = kid(f, 'gradientFill');
    if (g) {
      const stop = kid(kid(g, 'stop') as Element, 'color');
      return resolveColor(stop, pal);
    }
    return undefined;
  });

  const side = (b: Element, name: string): BorderSide | undefined => {
    const e = kid(b, name);
    const style = e?.getAttribute('style');
    if (!e || !style || !BORDER_KIND[style]) return undefined;
    return { ...BORDER_KIND[style], color: resolveColor(kid(e, 'color'), pal) ?? '#000000' };
  };
  const borders = kids(kid(root, 'borders') as Element, 'border').map((b) => ({
    top: side(b, 'top'),
    right: side(b, 'right'),
    bottom: side(b, 'bottom'),
    left: side(b, 'left'),
  }));

  const xfs: CellStyle[] = [];
  const xfFormat: string[] = [];
  const cellXfs = kid(root, 'cellXfs');
  if (cellXfs) {
    for (const xf of kids(cellXfs, 'xf')) {
      const font = fonts[Number(xf.getAttribute('fontId') ?? 0)] ?? fonts[0];
      const al = kid(xf, 'alignment');
      const hAttr = al?.getAttribute('horizontal') ?? 'general';
      const vAttr = al?.getAttribute('vertical') ?? 'bottom';
      const bd = borders[Number(xf.getAttribute('borderId') ?? 0)] ?? {};
      const numFmtId = Number(xf.getAttribute('numFmtId') ?? 0);
      xfFormat.push(numFmts.get(numFmtId) ?? BUILTIN_FORMATS[numFmtId] ?? 'General');
      xfs.push({
        fill: fills[Number(xf.getAttribute('fillId') ?? 0)],
        color: font.color,
        bold: font.bold,
        italic: font.italic,
        underline: font.underline,
        strike: font.strike,
        sizePt: font.sizePt,
        font: font.font,
        h: (['left', 'center', 'right', 'justify'].includes(hAttr)
          ? hAttr
          : hAttr === 'centerContinuous'
          ? 'center'
          : 'general') as CellStyle['h'],
        v: vAttr === 'center' ? 'middle' : vAttr === 'top' ? 'top' : 'bottom',
        wrap: al?.getAttribute('wrapText') === '1' || al?.getAttribute('wrapText') === 'true',
        indent: Number(al?.getAttribute('indent') ?? 0),
        rotation: Number(al?.getAttribute('textRotation') ?? 0),
        ...bd,
      });
    }
  }

  const dxfs: Dxf[] = [];
  const dx = kid(root, 'dxfs');
  if (dx) {
    for (const d of kids(dx, 'dxf')) dxfs.push(parseDxf(d, pal));
  }
  return { xfs, xfFormat, dxfs };
}

function parseDxf(d: Element, pal: Palette): Dxf {
  const out: Dxf = {};
  const fill = kid(d, 'fill');
  const pf = fill ? kid(fill, 'patternFill') : undefined;
  if (pf) out.fill = resolveColor(kid(pf, 'bgColor'), pal) ?? resolveColor(kid(pf, 'fgColor'), pal);
  const font = kid(d, 'font');
  if (font) {
    out.color = resolveColor(kid(font, 'color'), pal);
    if (kid(font, 'b')) out.bold = kid(font, 'b')?.getAttribute('val') !== '0';
  }
  return out;
}

// ======================= Conditional formatting =======================

interface CfRule {
  priority: number;
  type: string;
  operator?: string;
  text?: string;
  formulas: string[];
  dxf?: Dxf;
  ranges: Range[];
}

function parseCfRules(sheetDoc: Document, book: StyleBook, pal: Palette): CfRule[] {
  const rules: CfRule[] = [];
  const read = (cf: Element, ruleTag: string) => {
    const sqref = cf.getAttribute('sqref') ?? all(cf, 'sqref')[0]?.textContent ?? '';
    const ranges = sqref
      .split(/\s+/)
      .map(parseRange)
      .filter((x): x is Range => !!x);
    for (const rule of kids(cf, ruleTag)) {
      const dxfId = rule.getAttribute('dxfId');
      const inline = kid(rule, 'dxf');
      rules.push({
        priority: Number(rule.getAttribute('priority') ?? 9999),
        type: rule.getAttribute('type') ?? '',
        operator: rule.getAttribute('operator') ?? undefined,
        text: rule.getAttribute('text') ?? undefined,
        formulas: Array.from(rule.children)
          .filter((c) => c.localName === 'formula' || c.localName === 'f')
          .map((c) => c.textContent ?? ''),
        dxf: inline ? parseDxf(inline, pal) : dxfId !== null ? book.dxfs[Number(dxfId)] : undefined,
        ranges,
      });
    }
  };
  // standar
  for (const cf of kids(sheetDoc.documentElement, 'conditionalFormatting')) read(cf, 'cfRule');
  // ekstensi x14 (dipakai Excel untuk aturan yang merujuk sel lain)
  for (const ext of all(sheetDoc, 'conditionalFormatting')) {
    if (ext.namespaceURI && ext.namespaceURI.includes('2009/9/main')) {
      const sq = Array.from(ext.children).find((c) => c.localName === 'sqref');
      const holder = ext;
      const ranges = (sq?.textContent ?? '')
        .split(/\s+/)
        .map(parseRange)
        .filter((x): x is Range => !!x);
      for (const rule of kids(holder, 'cfRule')) {
        const inline = kid(rule, 'dxf');
        rules.push({
          priority: Number(rule.getAttribute('priority') ?? 9999),
          type: rule.getAttribute('type') ?? '',
          operator: rule.getAttribute('operator') ?? undefined,
          text: rule.getAttribute('text') ?? undefined,
          formulas: kids(rule, 'f').map((c) => c.textContent ?? ''),
          dxf: inline ? parseDxf(inline, pal) : undefined,
          ranges,
        });
      }
    }
  }
  return rules.sort((a, b) => a.priority - b.priority);
}

function operandValue(expr: string, getText: (r: number, c: number) => string): string | null {
  const e = expr.trim();
  if (!e || e.startsWith('#REF')) return null;
  const q = e.match(/^"(.*)"$/);
  if (q) return q[1];
  const ref = parseRef(e);
  if (ref) return getText(ref.r, ref.c);
  return e;
}

function ruleMatches(rule: CfRule, cell: RawCell, getText: (r: number, c: number) => string): boolean {
  const text = cell.text;
  switch (rule.type) {
    case 'containsText':
    case 'notContainsText':
    case 'beginsWith':
    case 'endsWith': {
      let needle: string | null = rule.text ?? null;
      if (needle === null) {
        const f = rule.formulas;
        if (f.length >= 2) needle = operandValue(f[1], getText);
        else {
          const m = (f[0] ?? '').match(/(?:SEARCH|LEFT|RIGHT)\((.+?),\s*[A-Z$]+\d+/i);
          needle = m ? operandValue(m[1], getText) : null;
        }
      }
      // null = rujukan rusak (#REF!) -> aturan tidak pernah berlaku.
      // '' (sel rujukan kosong) -> di Excel SEARCH("", teks) selalu ketemu, jadi cocok untuk sel yang berisi.
      if (needle === null) return false;
      if (needle === '') return rule.type === 'containsText' && text !== '';
      const t = text.toLowerCase();
      const n = needle.toLowerCase();
      if (rule.type === 'containsText') return t.includes(n);
      if (rule.type === 'notContainsText') return !t.includes(n);
      if (rule.type === 'beginsWith') return t.startsWith(n);
      return t.endsWith(n);
    }
    case 'cellIs': {
      const a = operandValue(rule.formulas[0] ?? '', getText);
      if (a === null) return false;
      const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
      const cellNum = cell.isNumber ? num(text) : NaN;
      const aNum = Number(a);
      const bothNum = !Number.isNaN(cellNum) && !Number.isNaN(aNum);
      switch (rule.operator) {
        case 'equal': return bothNum ? cellNum === aNum : text.toLowerCase() === a.toLowerCase();
        case 'notEqual': return bothNum ? cellNum !== aNum : text.toLowerCase() !== a.toLowerCase();
        case 'greaterThan': return bothNum && cellNum > aNum;
        case 'greaterThanOrEqual': return bothNum && cellNum >= aNum;
        case 'lessThan': return bothNum && cellNum < aNum;
        case 'lessThanOrEqual': return bothNum && cellNum <= aNum;
        case 'between': {
          const b = Number(operandValue(rule.formulas[1] ?? '', getText));
          return bothNum && !Number.isNaN(b) && cellNum >= Math.min(aNum, b) && cellNum <= Math.max(aNum, b);
        }
        default: return false;
      }
    }
    case 'containsBlanks': return text.trim() === '';
    case 'notContainsBlanks': return text.trim() !== '';
    case 'containsErrors': return /^#/.test(text);
    default: return false; // expression, duplicateValues, colorScale, dataBar, dst. belum didukung
  }
}

function applyConditionalFormatting(sheet: SheetModel, rules: CfRule[]) {
  if (rules.length === 0) return;
  const getText = (r: number, c: number) => sheet.cells.get(cellKey(r, c))?.text ?? '';
  for (const cell of sheet.cells.values()) {
    let fillDone = false;
    let colorDone = false;
    let boldDone = false;
    let patched: CellStyle | null = null;
    for (const rule of rules) {
      if (!rule.dxf) continue;
      if (!rule.ranges.some((g) => cell.r >= g.r1 && cell.r <= g.r2 && cell.c >= g.c1 && cell.c <= g.c2)) continue;
      if (!ruleMatches(rule, cell, getText)) continue;
      patched = patched ?? { ...cell.style };
      if (rule.dxf.fill && !fillDone) {
        patched.fill = rule.dxf.fill;
        fillDone = true;
      }
      if (rule.dxf.color && !colorDone) {
        patched.color = rule.dxf.color;
        colorDone = true;
      }
      if (rule.dxf.bold !== undefined && !boldDone) {
        patched.bold = rule.dxf.bold;
        boldDone = true;
      }
    }
    if (patched) cell.style = patched;
  }
}

// ======================= Sheet =======================

function richText(si: Element): string {
  // gabungkan semua <t> kecuali pelafalan (rPh)
  let out = '';
  for (const node of Array.from(si.children)) {
    if (node.localName === 't') out += node.textContent ?? '';
    else if (node.localName === 'r') {
      const t = kid(node, 't');
      if (t) out += t.textContent ?? '';
    }
  }
  return out;
}

interface Ctx {
  shared: string[];
  book: StyleBook;
  pal: Palette;
  date1904: boolean;
}

function parseSheet(name: string, hidden: boolean, xml: string, ctx: Ctx): SheetModel {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const baseStyle = ctx.book.xfs[0];

  const sheet: SheetModel = {
    name,
    hidden,
    cells: new Map(),
    rowHeightPx: new Map(),
    hiddenRows: new Set(),
    rowStyle: new Map(),
    colWidthPx: new Map(),
    hiddenCols: new Set(),
    colStyle: new Map(),
    defaultColPx: 64,
    defaultRowPx: 20,
    zeroHeightRows: false,
    merges: [],
    used: null,
    baseStyle,
  };

  const fmtPr = kid(root, 'sheetFormatPr');
  if (fmtPr) {
    const dcw = fmtPr.getAttribute('defaultColWidth');
    const bcw = fmtPr.getAttribute('baseColWidth');
    if (dcw) sheet.defaultColPx = Math.round(Number(dcw) * 7);
    else if (bcw) sheet.defaultColPx = Math.round((Number(bcw) * 7 + 5));
    const drh = fmtPr.getAttribute('defaultRowHeight');
    if (drh) sheet.defaultRowPx = Math.round((Number(drh) * 4) / 3);
    sheet.zeroHeightRows = fmtPr.getAttribute('zeroHeight') === '1';
  }

  const cols = kid(root, 'cols');
  if (cols) {
    for (const col of kids(cols, 'col')) {
      const min = Number(col.getAttribute('min'));
      const max = Math.min(Number(col.getAttribute('max')), 16384);
      const width = col.getAttribute('width');
      const isHidden = col.getAttribute('hidden') === '1';
      const sIdx = col.getAttribute('style');
      for (let c = min; c <= Math.min(max, min + 2000); c++) {
        if (width) sheet.colWidthPx.set(c, Math.round(Number(width) * 7));
        if (isHidden) sheet.hiddenCols.add(c);
        if (sIdx && Number(sIdx) > 0) sheet.colStyle.set(c, ctx.book.xfs[Number(sIdx)]);
      }
    }
  }

  const sd = kid(root, 'sheetData');
  if (sd) {
    for (const row of kids(sd, 'row')) {
      const r = Number(row.getAttribute('r'));
      const ht = row.getAttribute('ht');
      if (ht) sheet.rowHeightPx.set(r, Math.round((Number(ht) * 4) / 3));
      if (row.getAttribute('hidden') === '1') sheet.hiddenRows.add(r);
      if (row.getAttribute('customFormat') === '1' && row.getAttribute('s')) {
        sheet.rowStyle.set(r, ctx.book.xfs[Number(row.getAttribute('s'))]);
      }
      for (const c of kids(row, 'c')) {
        const ref = parseRef(c.getAttribute('r') ?? '');
        if (!ref) continue;
        const sIdx = Number(c.getAttribute('s') ?? 0);
        const style = ctx.book.xfs[sIdx] ?? baseStyle;
        const type = c.getAttribute('t') ?? 'n';
        const vEl = kid(c, 'v');
        const v = vEl?.textContent ?? '';
        let text = '';
        let isNumber = false;
        let isCentered = false;

        if (type === 's') text = ctx.shared[Number(v)] ?? '';
        else if (type === 'str') text = v;
        else if (type === 'inlineStr') text = richText(kid(c, 'is') as Element);
        else if (type === 'b') {
          text = v === '1' ? 'TRUE' : 'FALSE';
          isCentered = true;
        } else if (type === 'e') {
          text = v;
          isCentered = true;
        } else if (type === 'd') text = v;
        else if (v !== '') {
          const num = Number(v);
          if (!Number.isNaN(num)) {
            isNumber = true;
            const fmt = ctx.book.xfFormat[sIdx] ?? 'General';
            try {
              text = formatNumberWithCode(num, fmt, ctx.date1904);
            } catch {
              text = String(num);
            }
          }
        }
        sheet.cells.set(cellKey(ref.r, ref.c), { r: ref.r, c: ref.c, text, isNumber, isCentered, style });
      }
    }
  }

  const mc = kid(root, 'mergeCells');
  if (mc) {
    for (const m of kids(mc, 'mergeCell')) {
      const rg = parseRange(m.getAttribute('ref') ?? '');
      if (rg) sheet.merges.push(rg);
    }
  }

  applyConditionalFormatting(sheet, parseCfRules(doc, ctx.book, ctx.pal));

  // area terpakai: sel yang berisi teks, warna isi, atau garis tepi
  let used: Range | null = null;
  for (const cell of sheet.cells.values()) {
    const s = cell.style;
    const visible = cell.text.trim() !== '' || !!s.fill || !!(s.top || s.right || s.bottom || s.left);
    if (!visible) continue;
    used = used
      ? { r1: Math.min(used.r1, cell.r), c1: Math.min(used.c1, cell.c), r2: Math.max(used.r2, cell.r), c2: Math.max(used.c2, cell.c) }
      : { r1: cell.r, c1: cell.c, r2: cell.r, c2: cell.c };
  }
  for (const m of sheet.merges) {
    if (used && m.r1 >= used.r1 && m.r1 <= used.r2 && m.c1 >= used.c1 && m.c1 <= used.c2) {
      used = { r1: used.r1, c1: used.c1, r2: Math.max(used.r2, m.r2), c2: Math.max(used.c2, m.c2) };
    }
  }
  sheet.used = used;
  return sheet;
}

// ======================= Workbook =======================

export async function readXlsx(file: File | ArrayBuffer, fileName = 'workbook.xlsx'): Promise<WorkbookModel> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const text = async (path: string) => {
    const f = zip.file(path);
    return f ? f.async('string') : undefined;
  };

  const wbXml = await text('xl/workbook.xml');
  if (!wbXml) throw new Error('Bukan file Excel .xlsx yang valid (xl/workbook.xml tidak ditemukan).');
  const relsXml = (await text('xl/_rels/workbook.xml.rels')) ?? '';
  const stylesXml = await text('xl/styles.xml');
  if (!stylesXml) throw new Error('File Excel tidak lengkap (styles.xml tidak ditemukan).');

  const pal: Palette = { theme: parseTheme(await text('xl/theme/theme1.xml')), indexed: [...INDEXED_DEFAULT] };
  const book = parseStyles(stylesXml, pal);

  const shared: string[] = [];
  const ssXml = await text('xl/sharedStrings.xml');
  if (ssXml) for (const si of all(parseXml(ssXml), 'si')) shared.push(richText(si));

  const wbDoc = parseXml(wbXml);
  const date1904 = all(wbDoc, 'workbookPr')[0]?.getAttribute('date1904') === '1';

  const relTarget = new Map<string, string>();
  for (const rel of all(parseXml(relsXml), 'Relationship')) {
    let t = rel.getAttribute('Target') ?? '';
    t = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
    relTarget.set(rel.getAttribute('Id') ?? '', t.replace(/^xl\/\.\.\//, ''));
  }

  // nama terdefinisi: area cetak & judul berulang, per sheet (localSheetId = urutan sheet)
  const printAreas = new Map<number, Range>();
  const printTitles = new Map<number, [number, number]>();
  for (const dn of all(wbDoc, 'definedName')) {
    const local = dn.getAttribute('localSheetId');
    if (local === null) continue;
    const idx = Number(local);
    const nm = dn.getAttribute('name');
    const val = dn.textContent ?? '';
    if (nm === '_xlnm.Print_Area') {
      const rg = parseRange(val.split(',')[0].replace(/^.*!/, ''));
      if (rg) printAreas.set(idx, rg);
    } else if (nm === '_xlnm.Print_Titles') {
      const m = val.match(/\$(\d+):\$(\d+)/);
      if (m) printTitles.set(idx, [Number(m[1]), Number(m[2])]);
    }
  }

  const sheets: SheetModel[] = [];
  const sheetEls = all(wbDoc, 'sheet');
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    const target = relTarget.get(el.getAttribute('r:id') ?? '');
    const xml = target ? await text(target) : undefined;
    if (!xml) continue;
    const model = parseSheet(el.getAttribute('name') ?? `Sheet${i + 1}`, el.getAttribute('state') === 'hidden' || el.getAttribute('state') === 'veryHidden', xml, {
      shared,
      book,
      pal,
      date1904,
    });
    model.printArea = printAreas.get(i);
    model.repeatRows = printTitles.get(i);
    sheets.push(model);
  }
  return { fileName, sheets };
}