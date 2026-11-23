/**
 * Memasang "Data proyek bersama + dropdown District" ke SEMUA form di
 * src/components sekaligus (Cover, Berita Acara, BOQ, Evidence, OPM, Mancore,
 * KML, dst.), tanpa perlu mengedit satu per satu.
 *
 * Cara pakai (dari folder utama project, yang berisi package.json):
 *   node apply-shared-project.mjs --cek     <- hanya melihat apa yang akan diubah
 *   node apply-shared-project.mjs           <- menerapkan perubahan
 *
 * Aman dijalankan berulang kali (file yang sudah diubah dilewati). File asli
 * dicadangkan dulu di folder .backup-data-proyek/ sebelum diubah.
 */
import fs from 'node:fs';
import path from 'node:path';

const dryRun = process.argv.includes('--cek');
const root = process.cwd();
const dir = path.join(root, 'src', 'components');
const backupDir = path.join(root, '.backup-data-proyek');

if (!fs.existsSync(dir)) {
  console.error('Folder src/components tidak ditemukan. Jalankan perintah ini dari folder utama project.');
  process.exit(1);
}

const IMPORT_STORE = "import { useSharedProject } from '../utils/projectStore';";
const IMPORT_DISTRICT = "import DistrictSelect from './DistrictSelect';";

// Pernyataan import terakhir di file (mendukung import banyak baris & import CSS)
function endOfLastImport(s) {
  const re = /^import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];[ \t]*\n/gm;
  let end = 0;
  let m;
  while ((m = re.exec(s)) !== null) end = m.index + m[0].length;
  return end;
}

// <input ... value={project.district} ... /> (satu elemen input saja, tidak melompati input lain)
const DISTRICT_INPUT =
  /<input\b(?:(?!<input\b)[\s\S])*?value=\{project\.district\}(?:(?!<input\b)[\s\S])*?\/>/;

const report = [];

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx')).sort()) {
  const file = path.join(dir, name);
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');

  // Hanya file yang punya state data proyek sendiri
  const hasLocalState = /const \[project, setProject\] = useState<ProjectData>\(emptyProject\);/.test(s);
  const alreadyShared = s.includes('useSharedProject(');
  const hasDistrictInput = DISTRICT_INPUT.test(s);
  const alreadySelect = s.includes('<DistrictSelect');

  if (!hasLocalState && !alreadyShared) continue; // bukan form dengan data proyek

  const done = [];
  const todo = [];

  // 1) state lokal -> penyimpanan bersama
  if (hasLocalState) {
    s = s.replace(
      /const \[project, setProject\] = useState<ProjectData>\(emptyProject\);/,
      'const [project, setProject] = useSharedProject(emptyProject);'
    );
    done.push('data proyek dibagikan antar bagian');
  }

  // 2) kolom ketik District -> dropdown
  if (hasDistrictInput && !alreadySelect) {
    const m = s.match(DISTRICT_INPUT);
    if (m && /handleProjectChange\('district',\s*e\.target\.value\)/.test(m[0])) {
      const lineStart = s.lastIndexOf('\n', m.index) + 1;
      const indent = s.slice(lineStart, m.index).match(/^\s*/)[0];
      const replacement =
        `<DistrictSelect\n${indent}  value={project.district}\n` +
        `${indent}  onChange={(v) => handleProjectChange('district', v)}\n${indent}/>`;
      s = s.slice(0, m.index) + replacement + s.slice(m.index + m[0].length);
      done.push('District jadi dropdown');
    } else {
      todo.push('kolom District ada, tapi bentuknya beda: perlu diganti manual ke <DistrictSelect />');
    }
  } else if (!hasDistrictInput && !alreadySelect) {
    todo.push('kolom District tidak ditemukan');
  }

  // 3) import yang dibutuhkan
  const need = [];
  if (s.includes('useSharedProject(') && !s.includes(IMPORT_STORE)) need.push(IMPORT_STORE);
  if (s.includes('<DistrictSelect') && !s.includes(IMPORT_DISTRICT)) need.push(IMPORT_DISTRICT);
  if (need.length > 0) {
    const at = endOfLastImport(s);
    s = s.slice(0, at) + need.join('\n') + '\n' + s.slice(at);
  }

  if (done.length === 0 && todo.length === 0) {
    report.push({ name, status: 'sudah diterapkan' });
    continue;
  }

  if (done.length > 0 && !dryRun) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, name), raw);
    fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  }
  report.push({ name, status: done.length ? (dryRun ? 'AKAN diubah' : 'diubah') : 'perlu manual', done, todo });
}

console.log(dryRun ? '\n=== MODE CEK (belum ada file yang diubah) ===\n' : '\n=== HASIL ===\n');
if (report.length === 0) console.log('Tidak ada form dengan data proyek yang ditemukan.');
for (const r of report) {
  console.log(`- ${r.name}: ${r.status}`);
  (r.done ?? []).forEach((d) => console.log(`    + ${d}`));
  (r.todo ?? []).forEach((t) => console.log(`    ! ${t}`));
}
if (!dryRun && report.some((r) => r.status === 'diubah')) {
  console.log('\nFile asli dicadangkan di folder .backup-data-proyek/');
}
console.log('');
