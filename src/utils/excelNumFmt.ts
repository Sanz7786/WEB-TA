/**
 * Pemformat angka & tanggal gaya Excel (kode format seperti "0.00", "#,##0",
 * "dd/mm/yyyy", "0.0 \"dBm\"" dst).
 *
 * Tampilan memakai pemisah Indonesia: desimal "," dan ribuan "." (sama seperti
 * Excel yang dibuka di komputer berbahasa Indonesia). Ubah LOCALE di bawah kalau
 * mau pemisah gaya Inggris.
 */
export const LOCALE = { decimal: ',', thousands: '.' };

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Kode format bawaan Excel (numFmtId < 164) */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  9: '0%', 10: '0.00%', 11: '0.00E+00',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm',
  37: '#,##0;(#,##0)', 38: '#,##0;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '#,##0', 42: '"Rp"#,##0', 43: '#,##0.00', 44: '"Rp"#,##0.00',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 49: '@',
};

type Tok =
  | { k: 'lit'; v: string }
  | { k: 'digit'; v: string }
  | { k: 'dot' }
  | { k: 'comma' }
  | { k: 'pct' }
  | { k: 'exp' }
  | { k: 'gen' }
  | { k: 'dt'; v: string }
  | { k: 'ampm'; v: string };

/** Pecah kode format jadi bagian-bagian (positif;negatif;nol;teks), mengabaikan ";" di dalam tanda kutip/kurung */
function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = false;
  let bracket = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '\\') {
      cur += ch + (fmt[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') quote = !quote;
    else if (!quote && ch === '[') bracket = true;
    else if (!quote && ch === ']') bracket = false;
    if (ch === ';' && !quote && !bracket) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function tokenize(sec: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < sec.length) {
    const ch = sec[i];
    const rest = sec.slice(i);
    if (ch === '"') {
      const end = sec.indexOf('"', i + 1);
      const stop = end === -1 ? sec.length : end;
      toks.push({ k: 'lit', v: sec.slice(i + 1, stop) });
      i = stop + 1;
    } else if (ch === '\\') {
      toks.push({ k: 'lit', v: sec[i + 1] ?? '' });
      i += 2;
    } else if (ch === '_') {
      toks.push({ k: 'lit', v: ' ' });
      i += 2;
    } else if (ch === '*') {
      i += 2; // karakter pengisi: diabaikan
    } else if (ch === '[') {
      const end = sec.indexOf(']', i);
      const stop = end === -1 ? sec.length : end;
      const inner = sec.slice(i + 1, stop);
      if (inner.startsWith('$')) {
        const sym = inner.slice(1).split('-')[0];
        if (sym) toks.push({ k: 'lit', v: sym });
      } else if (/^(h+|m+|s+)$/i.test(inner)) {
        toks.push({ k: 'dt', v: inner.toLowerCase() });
      } // warna [Red] / kondisi [>100]: diabaikan
      i = stop + 1;
    } else if (/^general/i.test(rest)) {
      toks.push({ k: 'gen' });
      i += 7;
    } else if (/^(am\/pm|a\/p)/i.test(rest)) {
      const m = rest.match(/^(am\/pm|a\/p)/i) as RegExpMatchArray;
      toks.push({ k: 'ampm', v: m[0] });
      i += m[0].length;
    } else if (/^e[+-]/i.test(rest)) {
      toks.push({ k: 'exp' });
      i += 2;
    } else if ('0#?'.includes(ch)) {
      toks.push({ k: 'digit', v: ch });
      i++;
    } else if (ch === '.') {
      toks.push({ k: 'dot' });
      i++;
    } else if (ch === ',') {
      toks.push({ k: 'comma' });
      i++;
    } else if (ch === '%') {
      toks.push({ k: 'pct' });
      i++;
    } else if (/[ymdhs]/i.test(ch)) {
      const m = rest.match(new RegExp(`^${ch}+`, 'i')) as RegExpMatchArray;
      toks.push({ k: 'dt', v: m[0].toLowerCase() });
      i += m[0].length;
    } else {
      toks.push({ k: 'lit', v: ch });
      i++;
    }
  }
  return toks;
}

/** Format "General" Excel: maksimal ~10 angka penting, buang nol di belakang. */
export function formatGeneral(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  let s = String(Number(v.toPrecision(10)));
  if (s.includes('e')) s = v.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'E+').replace('e-', 'E-');
  return s.replace('.', LOCALE.decimal);
}

function roundHalfAwayFromZero(abs: number, decimals: number): string {
  const shifted = Math.round(Number(`${abs}e${decimals}`));
  const back = Number(`${shifted}e-${decimals}`);
  return (Number.isFinite(back) ? back : abs).toFixed(decimals);
}

function renderNumber(toks: Tok[], value: number, negAsAbs: boolean): string {
  let v = value;
  const pctCount = toks.filter((t) => t.k === 'pct').length;
  if (pctCount) v *= 100 ** pctCount;

  const digitIdx = toks.map((t, i) => (t.k === 'digit' ? i : -1)).filter((i) => i >= 0);
  const hasGen = toks.some((t) => t.k === 'gen');
  if (digitIdx.length === 0 && !hasGen) {
    return (v < 0 && !negAsAbs ? '-' : '') + toks.map((t) => (t.k === 'lit' ? t.v : t.k === 'pct' ? '%' : '')).join('');
  }

  const first = digitIdx.length ? digitIdx[0] : toks.findIndex((t) => t.k === 'gen');
  let last = digitIdx.length ? digitIdx[digitIdx.length - 1] : first;

  // koma tepat setelah placeholder terakhir = pembagi 1000 (tiap koma)
  let scale = 0;
  while (toks[last + 1 + scale]?.k === 'comma') scale++;
  if (scale) v /= 1000 ** scale;

  let core: string;
  if (hasGen && digitIdx.length === 0) {
    core = formatGeneral(Math.abs(v));
  } else {
    const span = toks.slice(first, last + 1);
    const dotPos = span.findIndex((t) => t.k === 'dot');
    const intPart = dotPos === -1 ? span : span.slice(0, dotPos);
    const decPart = dotPos === -1 ? [] : span.slice(dotPos + 1);
    const thousands = intPart.some((t) => t.k === 'comma');
    const decimals = decPart.filter((t) => t.k === 'digit').length;
    const minDec = decPart.filter((t) => t.k === 'digit' && t.v === '0').length;
    const minInt = intPart.filter((t) => t.k === 'digit' && t.v === '0').length;

    const fixed = roundHalfAwayFromZero(Math.abs(v), decimals);
    let [ip, fp = ''] = fixed.split('.');
    while (fp.length > minDec && fp.endsWith('0')) fp = fp.slice(0, -1);
    if (ip.length < minInt) ip = ip.padStart(minInt, '0');
    if (minInt === 0 && ip === '0') ip = '';
    if (thousands) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, LOCALE.thousands);
    core = ip + (fp ? LOCALE.decimal + fp : '');
    if (!core) {
      // Placeholder "?" tanpa angka = spasi selebar angka (mis. format akuntansi _(* "-"??_) untuk nol -> "-").
      // Sebelumnya selalu dipaksa jadi "0" sehingga tampil "-0".
      const spaces = intPart.filter((t) => t.k === 'digit' && t.v === '?').length;
      core = spaces > 0 ? '\u2007'.repeat(spaces) : '0';
    }
  }

  const render = (list: Tok[]) =>
    list.map((t) => (t.k === 'lit' ? t.v : t.k === 'pct' ? '%' : '')).join('');
  const before = render(toks.slice(0, first));
  const after = render(toks.slice(last + 1 + scale));
  const isNegativeRounded = v < 0 && Number(core.replace(/\./g, '').replace(',', '.')) !== 0;
  return (isNegativeRounded && !negAsAbs ? '-' : '') + before + core + after;
}

function serialToDate(serial: number, date1904: boolean): Date {
  const s = date1904 ? serial + 1462 : serial;
  return new Date(Math.round((s - 25569) * 86400000));
}

function renderDate(toks: Tok[], serial: number, date1904: boolean): string {
  let ms = serialToDate(serial, date1904).getTime();
  const hasSeconds = toks.some((t) => t.k === 'dt' && t.v.startsWith('s'));
  if (hasSeconds || toks.some((t) => t.k === 'dt' && t.v.startsWith('h'))) ms = Math.round(ms / 1000) * 1000;
  const d = new Date(ms);
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth();
  const D = d.getUTCDate();
  const H = d.getUTCHours();
  const Mi = d.getUTCMinutes();
  const S = d.getUTCSeconds();
  const W = d.getUTCDay();
  const twelve = toks.some((t) => t.k === 'ampm');
  const p2 = (n: number) => String(n).padStart(2, '0');

  const dtIdx = toks.map((t, i) => (t.k === 'dt' ? i : -1)).filter((i) => i >= 0);
  return toks
    .map((t, i) => {
      if (t.k === 'lit') return t.v;
      if (t.k === 'ampm') return H < 12 ? (t.v.length > 1 && t.v[1] === '/' ? 'A' : 'AM') : t.v.length > 1 && t.v[1] === '/' ? 'P' : 'PM';
      if (t.k !== 'dt') return '';
      const v = t.v;
      if (v.startsWith('y')) return v.length <= 2 ? p2(Y % 100) : String(Y);
      if (v.startsWith('d')) return v.length === 1 ? String(D) : v.length === 2 ? p2(D) : v.length === 3 ? DAYS_SHORT[W] : DAYS[W];
      if (v.startsWith('h')) {
        const h = twelve ? H % 12 || 12 : H;
        return v.length >= 2 ? p2(h) : String(h);
      }
      if (v.startsWith('s')) return v.length >= 2 ? p2(S) : String(S);
      if (v.startsWith('m')) {
        // "m" setelah jam atau sebelum detik = menit, selain itu = bulan
        const pos = dtIdx.indexOf(i);
        const prev = toks[dtIdx[pos - 1]];
        const next = toks[dtIdx[pos + 1]];
        const isMinute =
          (prev && prev.k === 'dt' && prev.v.startsWith('h')) || (next && next.k === 'dt' && next.v.startsWith('s'));
        if (isMinute && v.length <= 2) return v.length === 2 ? p2(Mi) : String(Mi);
        if (v.length === 1) return String(M + 1);
        if (v.length === 2) return p2(M + 1);
        if (v.length === 3) return MONTHS_SHORT[M];
        if (v.length === 4) return MONTHS[M];
        return MONTHS[M][0];
      }
      return '';
    })
    .join('');
}

/** Format satu angka sesuai kode format Excel. */
export function formatNumberWithCode(value: number, code: string, date1904 = false): string {
  if (!code || /^general$/i.test(code.trim())) return formatGeneral(value);
  const secs = splitSections(code);
  let sec = secs[0];
  let negAsAbs = false;
  if (secs.length > 1) {
    if (value < 0) {
      sec = secs[1];
      negAsAbs = true;
    } else if (value === 0 && secs.length > 2) sec = secs[2];
  }
  const toks = tokenize(sec);
  if (toks.length === 0) return '';
  if (toks.some((t) => t.k === 'dt' || t.k === 'ampm')) return renderDate(toks, value, date1904);
  return renderNumber(toks, value, negAsAbs);
}

/** Apakah kode format ini format tanggal/jam? */
export function isDateFormat(code: string): boolean {
  if (!code || /^general$/i.test(code.trim())) return false;
  return tokenize(splitSections(code)[0]).some((t) => t.k === 'dt' || t.k === 'ampm');
}