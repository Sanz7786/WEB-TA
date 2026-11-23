/**
 * Data proyek (Proyek, Kontrak, Surat Pesanan, District, Lokasi, Pelaksana)
 * yang DIPAKAI BERSAMA oleh semua bagian: Cover sampai Lampiran KML.
 *
 * KENAPA: dulu tiap form menyimpan isian ini di state-nya sendiri, jadi hilang
 * setiap pindah menu dan harus diketik ulang. Sekarang cukup diisi sekali
 * (mis. di Cover); bagian lain otomatis terisi, dan kalau diubah di salah satu
 * bagian, semua bagian ikut berubah.
 *
 * Data LACT dan BAUT dipisah (sama seperti Paket PDF), dibedakan dari alamat
 * halaman (/lact atau /baut). Disimpan di MEMORI saja: hilang kalau halaman
 * di-refresh atau ditutup, sama seperti Paket PDF.
 *
 * Cara pakai di form (pengganti useState):
 *   const [project, setProject] = useSharedProject(emptyProject);
 * Bentuknya sama persis dengan useState, termasuk setProject((prev) => ...).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import type { ProjectData } from '../types/evidence';

const EMPTY: ProjectData = {
  proyek: '',
  kontrak: '',
  suratPesanan: '',
  district: '',
  lokasi: '',
  pelaksana: '',
};

type Updater = ProjectData | ((prev: ProjectData) => ProjectData);

const store = new Map<string, ProjectData>();
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const keyFromPath = (pathname: string) => (pathname.startsWith('/baut') ? 'baut' : 'lact');

/** Hapus data proyek (mis. untuk memulai proyek baru). */
export function clearSharedProject(builder?: 'lact' | 'baut') {
  if (builder) store.delete(builder);
  else store.clear();
  listeners.forEach((l) => l());
}

// `_initial` hanya menjaga bentuk pemanggilan sama dengan useState(emptyProject).
export function useSharedProject(_initial?: ProjectData): [ProjectData, (u: Updater) => void] {
  const { pathname } = useLocation();
  const key = keyFromPath(pathname);

  const project = useSyncExternalStore(subscribe, () => store.get(key) ?? EMPTY);

  const setProject = useCallback(
    (u: Updater) => {
      const prev = store.get(key) ?? EMPTY;
      const next = typeof u === 'function' ? u(prev) : u;
      store.set(key, next);
      listeners.forEach((l) => l());
    },
    [key]
  );

  return [project, setProject];
}