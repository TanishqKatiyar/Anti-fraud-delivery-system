import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import CustomerApp from './pages/CustomerApp.jsx'
import PackerTablet from './pages/PackerTablet.jsx'
import WarehouseDashboard from './pages/WarehouseDashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/customer" element={<CustomerApp />} />
      <Route path="/packer" element={<PackerTablet />} />
      <Route path="/dashboard" element={<WarehouseDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
