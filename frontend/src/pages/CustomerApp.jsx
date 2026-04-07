import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { getOrder, verifyDelivery, generateQR } from '../lib/api.js'
import { useSocket } from '../hooks/useSocket.js'
import './CustomerApp.css'

const STATUS_STEPS = ['placed', 'packing', 'packed', 'in_transit', 'delivered']
const STATUS_LABELS = {
  placed:     { label: 'Order Placed',     icon: '📦', desc: 'Your order is confirmed and being prepared for packing.' },
  packing:    { label: 'Being Packed',     icon: '🏭', desc: 'Your items are being picked and verified by AI scanner.' },
  packed:     { label: 'Bag Sealed',       icon: '🔒', desc: 'All items verified. Tamper-proof QR sealed inside the bag.' },
  in_transit: { label: 'Out for Delivery', icon: '🚚', desc: 'Your delivery partner is on the way.' },
  delivered:  { label: 'Delivered',        icon: '✅', desc: 'Delivery confirmed via QR scan. Enjoy!' },
}

function CameraZoneView({ zoneId, streamUrl }) {
  return (
    <div className="camera-zone">
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0c1120 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 8 }}>🎥</div>
          <div style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>LIVE FEED</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>{zoneId}</div>
        </div>
      </div>
      <div className="camera-scan-line" />
      <div className="camera-corner tl" />
      <div className="camera-corner tr" />
      <div className="camera-corner bl" />
      <div className="camera-corner br" />
      <div className="camera-zone-overlay">
        <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.6)', borderRadius: 6, backdropFilter: 'blur(8px)' }}>
          <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--cyan)' }}>● LIVE · {zoneId}</span>
        </div>
      </div>
    </div>
  )
}

function ScanProofCard({ scan, index }) {
  const isApproved = scan.scanStatus === 'APPROVED'
  return (
    <motion.div
      className={`scan-card ${isApproved ? 'scan-card--approved' : 'scan-card--rejected'}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <span className="scan-card-icon">{isApproved ? '✅' : '⚠️'}</span>
      <div>
        <div className="scan-card-id">{scan.productId}</div>
        <div className={`scan-card-status ${isApproved ? 'text-jade' : 'text-red'}`}>
          {scan.scanStatus.replace(/_/g, ' ')}
        </div>
        {scan.scannedAt && (
          <div className="scan-card-time text-muted text-mono">
            {new Date(scan.scannedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
      {scan.proofImageUrl?.startsWith('data:') && (
        <img src={scan.proofImageUrl} alt="proof" className="scan-card-proof" />
      )}
    </motion.div>
  )
}

export default function CustomerApp() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [orderId, setOrderId] = useState(params.get('orderId') || '')
  const [inputId, setInputId] = useState(params.get('orderId') || '')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)
  const [tokenInput, setTokenInput] = useState('')
  const [currentZone, setCurrentZone] = useState(null)
  const [scanLogs, setScanLogs] = useState([])

  const { connected, lastEvent } = useSocket(orderId)

  // Load order
  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    getOrder(orderId)
      .then(({ data }) => {
        setOrder(data.order)
        setScanLogs(data.order.scanLogs || [])
        if (data.order.zoneQueue?.[data.order.currentZoneIndex]) {
          setCurrentZone(data.order.zoneQueue[data.order.currentZoneIndex])
        }
        if (data.order.status === 'packed' || data.order.status === 'in_transit') {
          loadQR(orderId)
        }
      })
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [orderId])

  // Handle socket events
  useEffect(() => {
    if (!lastEvent) return
    const { type, data } = lastEvent
    if (type === 'order:status-update') {
      setOrder(prev => prev ? { ...prev, status: data.status } : prev)
    }
    if (type === 'scan:proof') {
      setScanLogs(prev => [{ productId: data.productId, scanStatus: data.status, proofImageUrl: data.proofImageUrl, scannedAt: new Date() }, ...prev])
    }
    if (type === 'order:delivered') {
      setOrder(prev => prev ? { ...prev, status: 'delivered' } : prev)
    }
    if (type === 'order:zone-assigned' || type === 'stream:switch') {
      setOrder(prev => prev ? { ...prev, zoneQueue: data.zoneQueue || prev.zoneQueue } : prev)
    }
  }, [lastEvent])

  async function loadQR(id) {
    try {
      const { data } = await generateQR(id)
      setQrData(data)
    } catch {}
  }

  async function handleVerify() {
    try {
      const { data } = await verifyDelivery(tokenInput, orderId)
      setVerifyResult(data)
    } catch (e) {
      setVerifyResult(e.response?.data || { status: 'ERROR', message: e.message })
    }
  }

  function handleLoadOrder(e) {
    e.preventDefault()
    setOrderId(inputId.trim())
    setError(null)
    setQrData(null)
    setVerifyResult(null)
  }

  const stepIndex = order ? STATUS_STEPS.indexOf(order.status) : -1

  return (
    <div className="customer-app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            ⛓️ Chain<span style={{ color: 'var(--cyan)' }}>Guard</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Customer App</div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item active">📦 My Order</button>
          <button className="nav-item" onClick={() => navigate('/packer')}>📋 Packer View</button>
          <button className="nav-item" onClick={() => navigate('/dashboard')}>🖥️ Dashboard</button>
          <button className="nav-item" onClick={() => navigate('/')}>🏠 Home</button>
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-sm" style={{ marginBottom: 6 }}>
            <span className={`status-dot ${connected ? 'cyan' : 'red'}`} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {connected ? 'Live Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Order ID input */}
        <div className="glass-card customer-id-card">
          <form onSubmit={handleLoadOrder} className="order-id-form">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Order ID</label>
              <input
                className="form-input"
                placeholder="Paste your MongoDB order ID…"
                value={inputId}
                onChange={e => setInputId(e.target.value)}
                id="order-id-input"
              />
            </div>
            <button className="btn btn-primary" type="submit" style={{ marginTop: 24 }}>
              Load Order →
            </button>
          </form>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.875rem', marginTop: 8 }}>{error}</div>}
        </div>

        {loading && (
          <div className="flex items-center gap-md" style={{ padding: '40px 0' }}>
            <div className="spinner" />
            <span className="text-secondary">Loading order…</span>
          </div>
        )}

        {order && (
          <div className="customer-layout">
            {/* Left column */}
            <div className="customer-left">
              {/* Status header */}
              <div className="glass-card order-status-card">
                <div className="flex items-center justify-between mb-md">
                  <div>
                    <h2 className="section-title">Order #{order._id.slice(-8).toUpperCase()}</h2>
                    <div className="text-muted text-mono" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                      Customer: {order.customerId}
                    </div>
                  </div>
                  <span className={`badge badge-${order.status}`}>
                    {STATUS_LABELS[order.status]?.icon} {order.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                {/* Timeline */}
                <div className="timeline" style={{ marginTop: 24 }}>
                  {STATUS_STEPS.map((step, i) => {
                    const info = STATUS_LABELS[step]
                    const isDone = i < stepIndex
                    const isActive = i === stepIndex
                    return (
                      <div className="timeline-step" key={step}>
                        <div className={`timeline-dot ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                          {isDone ? <span style={{ color: 'var(--jade)', fontSize: 12 }}>✓</span>
                            : isActive ? <span style={{ color: 'var(--cyan)', fontSize: 12 }}>●</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>○</span>}
                        </div>
                        <div className="timeline-content">
                          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{info.icon} {info.label}</div>
                          {isActive && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 4 }}
                            >
                              {info.desc}
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Camera zone */}
              {(order.status === 'packing' || order.status === 'placed') && currentZone && (
                <div className="glass-card" style={{ padding: 24 }}>
                  <div className="section-header">
                    <h3 className="section-title" style={{ fontSize: '1rem' }}>
                      📡 Live Camera Feed
                    </h3>
                    <span className="badge badge-cyan">{currentZone.zoneId}</span>
                  </div>
                  <CameraZoneView zoneId={currentZone.zoneId} streamUrl={currentZone.streamUrl} />
                  <p className="text-secondary" style={{ fontSize: '0.8125rem', marginTop: 12 }}>
                    Watching warehouse zone where your items are being picked and scanned.
                  </p>
                </div>
              )}

              {/* QR Verification */}
              {(order.status === 'packed' || order.status === 'in_transit' || order.status === 'delivered') && (
                <div className="glass-card qr-section">
                  <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>🔒 Delivery QR Verification</h3>
                  {order.status === 'delivered' || verifyResult?.status === 'VERIFIED' ? (
                    <div className="verify-success">
                      <div style={{ fontSize: '2.5rem' }}>✅</div>
                      <div className="text-jade" style={{ fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-heading)' }}>Delivery Confirmed</div>
                      <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                        Your delivery was verified successfully. The QR token has been consumed.
                      </div>
                    </div>
                  ) : (
                    <>
                      {qrData && (
                        <div className="qr-display">
                          <QRCodeSVG
                            value={qrData.tokenHash}
                            size={180}
                            fgColor="#00d4ff"
                            bgColor="transparent"
                            level="H"
                          />
                          <div className="text-muted text-mono" style={{ fontSize: '0.7rem', marginTop: 8, wordBreak: 'break-all', maxWidth: 200 }}>
                            {qrData.tokenHash.slice(0, 32)}…
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: 16 }}>
                        <div className="form-group">
                          <label className="form-label">Enter token to verify delivery</label>
                          <input
                            className="form-input"
                            placeholder="Paste QR token hash…"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            id="token-input"
                          />
                        </div>
                        {qrData && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 8, fontSize: '0.75rem' }}
                            onClick={() => setTokenInput(qrData.tokenHash)}
                          >
                            ↑ Auto-fill (demo)
                          </button>
                        )}
                        <button
                          className="btn btn-jade"
                          style={{ marginTop: 12, width: '100%' }}
                          onClick={handleVerify}
                          disabled={!tokenInput}
                          id="verify-btn"
                        >
                          Verify Delivery
                        </button>
                        {verifyResult && verifyResult.status !== 'VERIFIED' && (
                          <div className="verify-error">
                            ⚠️ {verifyResult.status}: {verifyResult.message}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="customer-right">
              {/* Items list */}
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 16 }}>🛒 Order Items</h3>
                <div className="items-list">
                  {order.items.map((item, i) => (
                    <div className="item-row" key={i}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                        <div className="text-muted text-mono" style={{ fontSize: '0.75rem' }}>{item.productId}</div>
                      </div>
                      <div className="flex items-center gap-sm">
                        <span className="badge badge-muted">×{item.quantity}</span>
                        <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{item.zoneCamera?.zoneId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scan logs */}
              <div className="glass-card" style={{ padding: 24 }}>
                <div className="section-header">
                  <h3 className="section-title" style={{ fontSize: '1rem' }}>🤖 AI Scan Results</h3>
                  <span className="badge badge-muted">{scanLogs.length}</span>
                </div>
                {scanLogs.length === 0 ? (
                  <div className="text-secondary" style={{ fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>
                    Scan results appear here in real-time as items are verified.
                  </div>
                ) : (
                  <div className="scan-logs">
                    <AnimatePresence>
                      {scanLogs.map((s, i) => (
                        <ScanProofCard key={i} scan={s} index={i} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
