import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './pages/Welcome';
import Lact from './pages/Lact';
import BuatBaut from './pages/BuatBaut';
import KompresFoto from './pages/KompresFoto';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/lact" element={<Lact />} />
        <Route path="/baut" element={<BuatBaut />} />
        <Route path="/kompres-foto" element={<KompresFoto />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </Router>
  );
}