import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './pages/Welcome';

// Lazy-load hanya untuk halaman fitur berat
const Lact = lazy(() => import('./pages/Lact'));
const BuatBaut = lazy(() => import('./pages/BuatBaut'));

function PageSkeleton() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-50">
      {/* Header placeholder */}
      <div className="h-16 w-full bg-white border-b border-slate-200 px-6 flex items-center justify-between">
        <div className="skeleton h-8 w-36" />
        <div className="skeleton h-9 w-9 rounded-full" />
      </div>

      {/* Body placeholder (Sidebar + Konten) */}
      <div className="flex flex-1 p-4 gap-6">
        <div className="hidden md:flex flex-col gap-3 w-60 bg-white p-4 rounded-xl border border-slate-200">
          <div className="skeleton h-10 w-full rounded-lg" />
          <div className="skeleton h-8 w-4/5 mt-2" />
          <div className="skeleton h-6 w-3/4 ml-3" />
          <div className="skeleton h-6 w-2/3 ml-3" />
          <div className="skeleton h-6 w-4/5 ml-3" />
          <div className="skeleton h-6 w-3/4 ml-3" />
        </div>

        <div className="flex-1 bg-white p-6 rounded-xl border border-slate-200 flex flex-col gap-4">
          <div className="skeleton h-8 w-1/3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-48 w-full mt-2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-28 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/lact" element={<Lact />} />
          <Route path="/baut" element={<BuatBaut />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
