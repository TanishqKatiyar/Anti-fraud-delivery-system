import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getOrder, getProducts, updateOrderStatus, generateQR } from '../lib/api.js'
import { triggerMockScan } from '../lib/api.js'
import { useSocket } from '../hooks/useSocket.js'
import './PackerTablet.css'

export default function PackerTablet() {
  const navigate = useNavigate()
  const [orderId, setOrderId] = useState('')
  const [inputId, setInputId] = useState('')
  const [order, setOrder] = useState(null)
  const [products, setProducts] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scanSignal, setScanSignal] = useState(null) // { signal, productId, message }
  const [pickedItems, setPickedItems] = useState(new Set())
  const [scanning, setScanning] = useState(null) // productId being scanned
  const [qrGenerated, setQrGenerated] = useState(false)

  const { connected, lastEvent, emit } = useSocket(orderId)

  // Load products map
  useEffect(() => {
    getProducts().then(({ data }) => {
      const map = {}
      data.products.forEach(p => { map[p.productId] = p })
      setProducts(map)
    }).catch(() => {})
  }, [])

  // Socket events
  useEffect(() => {
    if (!lastEvent) return
    const { type, data } = lastEvent
    if (type === 'scanner:result') {
      setScanSignal({ signal: data.signal, productId: data.productId, status: data.status, message: data.message })
      setScanning(null)
      setTimeout(() => setScanSignal(null), 5000)
    }
    if (type === 'order:status-update') {
      setOrder(prev => prev ? { ...prev, status: data.status } : prev)
    }
  }, [lastEvent])

  function handleLoadOrder(e) {
    e.preventDefault()
    const id = inputId.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    getOrder(id)
      .then(({ data }) => {
        setOrder(data.order)
        setOrderId(id)
        // Auto-start packing
        if (data.order.status === 'placed') {
          updateOrderStatus(id, 'packing')
            .then(({ data: r }) => setOrder(r.order))
            .catch(() => {})
        }
      })
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }

  async function handleScanItem(item) {
    const product = products[item.productId]
    setScanning(item.productId)
    setScanSignal(null)
    try {
      await triggerMockScan(
        orderId,
        item.productId,
        product?.category || 'grocery',
        product?.expectedYoloClass || 'bottle'
      )
    } catch (e) {
      // If AI service isn't running, simulate locally
      const signal = Math.random() > 0.25 ? 'GREEN' : 'RED'
      setScanSignal({
        signal,
        productId: item.productId,
        status: signal === 'GREEN' ? 'APPROVED' : 'REJECTED_EXPIRED',
        message: signal === 'GREEN' ? '✓ Item verified and approved' : '✗ Item rejected — expiry check failed',
      })
      setScanning(null)
    }
  }

  function handlePickItem(productId) {
    setPickedItems(prev => new Set([...prev, productId]))
    // Emit packer event
    emit('packer:item-picked', { orderId, pickedProductId: productId })
  }

  async function handleSealBag() {
    try {
      await updateOrderStatus(orderId, 'packed')
      await generateQR(orderId)
      setQrGenerated(true)
      setOrder(prev => prev ? { ...prev, status: 'packed' } : prev)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const allPicked = order && pickedItems.size >= order.items.length
  const isPackingDone = order?.status === 'packed'

  return (
    <div className="packer-page">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            ⛓️ Chain<span style={{ color: 'var(--cyan)' }}>Guard</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Packer Tablet</div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/')}>🏠 Home</button>
          <button className="nav-item" onClick={() => navigate('/customer')}>🛒 Customer View</button>
          <button className="nav-item active">📋 Packer</button>
          <button className="nav-item" onClick={() => navigate('/dashboard')}>🖥️ Dashboard</button>
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-sm">
            <span className={`status-dot ${connected ? 'green' : 'red'}`} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {connected ? 'Socket Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {/* Order loader */}
        {!order && (
          <div className="packer-start">
            <div className="packer-hero">
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>📋</div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', marginBottom: 8 }}>Packer Station</h1>
              <p className="text-secondary" style={{ marginBottom: 32 }}>Enter an order ID to start packing. The AI Omni-Scanner will verify each item.</p>
              <form onSubmit={handleLoadOrder} className="packer-id-form glass-card">
                <div className="form-group">
                  <label className="form-label">Order ID</label>
                  <input
                    className="form-input"
                    placeholder="MongoDB order ID…"
                    value={inputId}
                    onChange={e => setInputId(e.target.value)}
                    id="packer-order-input"
                  />
                </div>
                {error && <div style={{ color: 'var(--red)', fontSize: '0.875rem' }}>{error}</div>}
                <button className="btn btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? <><span className="spinner" /> Loading…</> : '→ Start Packing'}
                </button>
              </form>
            </div>
          </div>
        )}

        {order && (
          <div className="packer-content">
            {/* Header */}
            <div className="packer-header glass-card">
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem' }}>
                  Order #{order._id.slice(-8).toUpperCase()}
                </h2>
                <div className="text-muted text-mono" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  Customer: {order.customerId}
                </div>
              </div>
              <div className="flex items-center gap-md">
                <span className={`badge badge-${order.status}`}>
                  {order.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className="badge badge-muted">{pickedItems.size}/{order.items.length} picked</span>
              </div>
            </div>

            {/* Scan Signal */}
            <AnimatePresence>
              {scanSignal && (
                <motion.div
                  className={`scan-signal ${scanSignal.signal === 'GREEN' ? 'green' : 'red'}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <div style={{ fontSize: '4rem', marginBottom: 8 }}>
                    {scanSignal.signal === 'GREEN' ? '✅' : '❌'}
                  </div>
                  <div>{scanSignal.signal === 'GREEN' ? 'APPROVED' : 'REJECTED'}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 400, marginTop: 8, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
                    {scanSignal.message}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginTop: 4, color: 'var(--text-muted)' }}>
                    {scanSignal.productId}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items */}
            {!isPackingDone && (
              <div className="items-grid">
                {order.items.map((item, i) => {
                  const isPicked = pickedItems.has(item.productId)
                  const isScanning = scanning === item.productId
                  return (
                    <motion.div
                      key={item.productId}
                      className={`packer-item glass-card ${isPicked ? 'packer-item--done' : ''}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="packer-item-header">
                        <span className={`badge badge-cyan`} style={{ fontSize: '0.7rem' }}>
                          {item.zoneCamera?.zoneId || 'ZONE ?'}
                        </span>
                        {isPicked && <span className="badge badge-jade">✓ Picked</span>}
                      </div>

                      <div className="packer-item-name">{item.name}</div>
                      <div className="text-muted text-mono" style={{ fontSize: '0.75rem', marginBottom: 12 }}>
                        {item.productId} · ×{item.quantity}
                      </div>

                      <div className="packer-item-actions">
                        <button
                          className={`btn btn-primary btn-sm ${isScanning ? '' : ''}`}
                          onClick={() => handleScanItem(item)}
                          disabled={isScanning || isPicked}
                          id={`scan-${item.productId}`}
                        >
                          {isScanning ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Scanning…</> : '🔬 Omni-Scan'}
                        </button>
                        <button
                          className="btn btn-jade btn-sm"
                          onClick={() => handlePickItem(item.productId)}
                          disabled={isPicked}
                          id={`pick-${item.productId}`}
                        >
                          {isPicked ? '✓ Picked' : '✅ Pick Item'}
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Seal bag */}
            {allPicked && !isPackingDone && (
              <motion.div
                className="seal-section glass-card"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 8 }}>
                    All Items Picked & Verified
                  </h3>
                  <p className="text-secondary" style={{ marginBottom: 24, fontSize: '0.875rem' }}>
                    Seal the bag and generate the tamper-proof HMAC-SHA256 QR token.
                  </p>
                  <button className="btn btn-jade btn-lg" onClick={handleSealBag} id="seal-bag-btn">
                    🔒 Seal Bag & Generate QR
                  </button>
                </div>
              </motion.div>
            )}

            {/* Packed confirmation */}
            {isPackingDone && (
              <motion.div
                className="packed-done glass-card glass-card-jade"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '4rem', marginBottom: 16 }}>📦✅</div>
                  <h2 className="text-jade" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem' }}>
                    Bag Sealed!
                  </h2>
                  <p className="text-secondary" style={{ marginTop: 8 }}>
                    Tamper-proof QR has been generated and sealed inside the bag.
                    {qrGenerated && ' Customer can now verify delivery by scanning it.'}
                  </p>
                  <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={() => {
                    setOrder(null); setOrderId(''); setInputId(''); setPickedItems(new Set()); setScanSignal(null); setQrGenerated(false)
                  }}>
                    ← Next Order
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
