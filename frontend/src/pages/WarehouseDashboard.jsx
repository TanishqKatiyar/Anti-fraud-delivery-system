import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { getProducts } from '../lib/api.js'
import { useSocket } from '../hooks/useSocket.js'
import './WarehouseDashboard.css'

// Demo seed data for charts
function generateHourlyData() {
  const hours = []
  for (let h = 0; h < 12; h++) {
    hours.push({
      label: `${(9 + h).toString().padStart(2, '0')}:00`,
      orders: Math.floor(Math.random() * 18) + 2,
      scans: Math.floor(Math.random() * 45) + 10,
    })
  }
  return hours
}

const PIE_COLORS = ['#00ff88', '#ff4554', '#f59e0b']

const ORDER_STATUSES = ['placed', 'packing', 'packed', 'in_transit', 'delivered']
const STATUS_ICONS = { placed: '📦', packing: '🏭', packed: '🔒', in_transit: '🚚', delivered: '✅', cancelled: '❌' }

function StatCard({ value, label, color, icon, trend }) {
  return (
    <div className="stat-card glass-card">
      <div className="flex items-center justify-between mb-md">
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
        {trend != null && (
          <span style={{ fontSize: '0.75rem', color: trend >= 0 ? 'var(--jade)' : 'var(--red)' }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

// Simulated live fraud events
const DEMO_EVENTS = [
  { ts: Date.now() - 60000,  type: 'REJECTED_EXPIRED',    product: 'PROD_DAL_001',    zone: 'ZONE_A1', order: '6abc...001' },
  { ts: Date.now() - 120000, type: 'APPROVED',            product: 'PROD_OIL_001',    zone: 'ZONE_A2', order: '6abc...002' },
  { ts: Date.now() - 200000, type: 'REJECTED_WRONG_ITEM', product: 'PROD_CHIPS_001',  zone: 'ZONE_B1', order: '6abc...003' },
  { ts: Date.now() - 310000, type: 'APPROVED',            product: 'PROD_MILK_001',   zone: 'ZONE_B1', order: '6abc...004' },
  { ts: Date.now() - 400000, type: 'APPROVED',            product: 'PROD_SOAP_001',   zone: 'ZONE_C1', order: '6abc...005' },
]

export default function WarehouseDashboard() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [hourlyData] = useState(generateHourlyData)
  const [events, setEvents] = useState(DEMO_EVENTS)
  const [liveOrders, setLiveOrders] = useState([
    { id: '6abc001', customerId: 'demo_001', status: 'delivered',   items: 3 },
    { id: '6abc002', customerId: 'demo_002', status: 'in_transit',  items: 2 },
    { id: '6abc003', customerId: 'demo_003', status: 'packing',     items: 5 },
    { id: '6abc004', customerId: 'demo_004', status: 'placed',      items: 1 },
  ])
  const [scanStats] = useState({ approved: 28, rejected_expired: 4, rejected_wrong: 2 })

  const { connected, lastEvent } = useSocket()

  useEffect(() => {
    getProducts().then(({ data }) => setProducts(data.products || [])).catch(() => {})
  }, [])

  // Handle real-time scan events
  useEffect(() => {
    if (!lastEvent) return
    const { type, data } = lastEvent
    if (type === 'scanner:result') {
      setEvents(prev => [{
        ts: Date.now(),
        type: data.status,
        product: data.productId,
        zone: 'LIVE',
        order: data.orderId?.slice(-6),
      }, ...prev.slice(0, 19)])
    }
  }, [lastEvent])

  const totalScans = scanStats.approved + scanStats.rejected_expired + scanStats.rejected_wrong
  const approvalRate = Math.round((scanStats.approved / totalScans) * 100)

  const pieData = [
    { name: 'Approved', value: scanStats.approved },
    { name: 'Expired', value: scanStats.rejected_expired },
    { name: 'Wrong Item', value: scanStats.rejected_wrong },
  ]

  return (
    <div className="dashboard-page">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            ⛓️ Chain<span style={{ color: 'var(--cyan)' }}>Guard</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Warehouse Admin</div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/')}>🏠 Home</button>
          <button className="nav-item" onClick={() => navigate('/customer')}>🛒 Customer</button>
          <button className="nav-item" onClick={() => navigate('/packer')}>📋 Packer</button>
          <button className="nav-item active">🖥️ Dashboard</button>
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-sm" style={{ marginBottom: 8 }}>
            <span className={`status-dot ${connected ? 'green' : 'red'}`} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {products.length} products in DB
          </div>
        </div>
      </aside>

      <main className="main-content dashboard-main">
        {/* Page header */}
        <div className="section-header" style={{ marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.625rem', fontWeight: 700 }}>
              Warehouse Dashboard
            </h1>
            <p className="text-secondary" style={{ fontSize: '0.875rem', marginTop: 4 }}>
              Real-time fraud detection · Scan audit · Order oversight
            </p>
          </div>
          <div className="flex items-center gap-md">
            <span className="badge badge-jade">
              <span className="status-dot green" style={{ width: 5, height: 5 }} />
              AI Scanner Active
            </span>
            <span className="badge badge-cyan">DEMO MODE</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <StatCard value={liveOrders.length} label="Active Orders" color="var(--cyan)" icon="📦" trend={12} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
            <StatCard value={totalScans} label="Total Scans Today" color="var(--text-primary)" icon="🔬" trend={8} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <StatCard value={`${approvalRate}%`} label="Approval Rate" color="var(--jade)" icon="✅" trend={3} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}>
            <StatCard value={scanStats.rejected_expired + scanStats.rejected_wrong} label="Fraud Blocked" color="var(--red)" icon="🛡️" trend={-15} />
          </motion.div>
        </div>

        {/* Charts row */}
        <div className="charts-row">
          {/* Area chart */}
          <div className="glass-card chart-card">
            <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 20 }}>📈 Orders & Scans (Today)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradScans" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#8a9bb8' }}
                />
                <Area type="monotone" dataKey="orders" stroke="#00d4ff" fill="url(#gradOrders)" strokeWidth={2} name="Orders" />
                <Area type="monotone" dataKey="scans" stroke="#00ff88" fill="url(#gradScans)" strokeWidth={2} name="Scans" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div className="glass-card chart-card chart-card--sm">
            <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 20 }}>🍩 Scan Results</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '0.75rem', color: '#8a9bb8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom row */}
        <div className="bottom-row">
          {/* Orders table */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>📋 Live Orders</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveOrders.map(order => (
                    <tr key={order.id}>
                      <td className="text-mono" style={{ fontSize: '0.8rem' }}>{order.id.toUpperCase()}</td>
                      <td className="text-secondary">{order.customerId}</td>
                      <td>{order.items}</td>
                      <td>
                        <span className={`badge badge-${order.status}`}>
                          {STATUS_ICONS[order.status]} {order.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fraud event log */}
          <div className="glass-card" style={{ padding: 24 }}>
            <div className="section-header">
              <h3 className="section-title" style={{ fontSize: '1rem' }}>🚨 Scan Audit Log</h3>
              <span className="badge badge-muted">{events.length}</span>
            </div>
            <div className="fraud-log">
              {events.map((ev, i) => {
                const isRejected = ev.type !== 'APPROVED'
                return (
                  <motion.div
                    key={i}
                    className={`fraud-event ${isRejected ? 'fraud-event--alert' : 'fraud-event--ok'}`}
                    initial={i === 0 ? { opacity: 0, x: 20 } : {}}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div>
                      <div className="fraud-event-type" style={{ color: isRejected ? 'var(--red)' : 'var(--jade)' }}>
                        {isRejected ? '⚠️' : '✅'} {ev.type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-muted text-mono" style={{ fontSize: '0.7rem', marginTop: 2 }}>
                        {ev.product} · {ev.zone} · #{ev.order}
                      </div>
                    </div>
                    <div className="text-muted text-mono" style={{ fontSize: '0.7rem', flexShrink: 0 }}>
                      {new Date(ev.ts).toLocaleTimeString()}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Products quick grid */}
        {products.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>
              📦 Product Catalogue ({products.length})
            </h3>
            <div className="products-mini-grid">
              {products.map(p => (
                <div key={p.productId} className="product-mini-card">
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>{p.warehouseZone.zoneId}</span>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', marginTop: 6 }}>{p.name}</div>
                  <div className="text-muted text-mono" style={{ fontSize: '0.7rem' }}>{p.productId}</div>
                  <span className={`badge badge-muted`} style={{ marginTop: 6, fontSize: '0.65rem' }}>{p.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
