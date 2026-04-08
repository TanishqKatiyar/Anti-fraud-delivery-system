import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { getOrder, verifyDelivery, generateQR } from '../lib/api.js'
import { useSocket } from '../hooks/useSocket.js'
import './CustomerApp.css'

const STATUS_STEPS = ['placed', 'packing', 'packed', 'in_transit', 'delivered']
const STATUS_LABELS = {
  placed:     { label: 'Order Confirmed',  subtitle: 'We have received your order' },
  packing:    { label: 'Packing Order',    subtitle: 'Items are being packed at the store' },
  packed:     { label: 'Bag Sealed',       subtitle: 'Verified by ChainGuard AI' },
  in_transit: { label: 'On the way',       subtitle: 'Delivery partner is on the way' },
  delivered:  { label: 'Delivered',        subtitle: 'Handed over successfully' },
}

function CameraZoneView({ zoneId, streamUrl }) {
  return (
    <div className="bk-camera-zone">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ fontSize: '2rem' }}>🔴</div>
        <div style={{ color: '#fff', fontSize: '0.8rem', marginTop: 8, fontWeight: 600 }}>LIVE WAREHOUSE FEED</div>
      </div>
      <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4 }}>
        <span style={{ fontSize: '0.7rem', color: '#00d4ff' }}>● {zoneId}</span>
      </div>
    </div>
  )
}

function ScanProofCard({ scan }) {
  const isApproved = scan.scanStatus === 'APPROVED'
  return (
    <div className="bk-scan-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="bk-scan-icon">{isApproved ? '✅' : '⚠️'}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#111' }}>{scan.productId}</div>
          <div style={{ fontSize: '0.75rem', color: isApproved ? '#0e9f6e' : '#e02424' }}>
            {scan.scanStatus.replace(/_/g, ' ')}
          </div>
        </div>
      </div>
      {scan.proofImageUrl?.startsWith('data:') && (
        <img src={scan.proofImageUrl} alt="proof" className="bk-scan-proof" />
      )}
    </div>
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
    <div className="customer-app-wrapper">
      <div className="blinkit-mobile-container">
        {/* Header */}
        <header className="blinkit-header">
          <div className="blinkit-header-top">
            <div className="blinkit-brand">blinkit</div>
            <div className="blinkit-time">10 MINS</div>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#111' }}>
            <span style={{ fontWeight: 700 }}>Home</span> - Delivery Location
          </div>
        </header>

        {/* Load Order Form if none loaded */}
        {!order && (
          <div className="bk-card">
            <div className="bk-title">Track your order</div>
            <form onSubmit={handleLoadOrder} className="bk-form-group">
              <input 
                className="bk-input" 
                placeholder="Enter Order ID" 
                value={inputId} 
                onChange={e => setInputId(e.target.value)} 
              />
              <button className="bk-btn" type="submit">Track</button>
            </form>
            {error && <div style={{ color: 'red', fontSize: '0.8rem', marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>}

        {order && (
          <div style={{ paddingBottom: 40 }}>
            {/* ETA Banner */}
            <div className="bk-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: '2.5rem' }}>⏱️</div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111' }}>Arriving in 10 mins</div>
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                  Order #{order._id.slice(-8).toUpperCase()} • {connected ? '🟢 Live' : '🔴 Offline'}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bk-card">
              <div className="bk-timeline">
                {STATUS_STEPS.map((step, i) => {
                  const info = STATUS_LABELS[step]
                  const isDone = i < stepIndex
                  const isActive = i === stepIndex
                  return (
                    <div className={`bk-timeline-step ${isDone ? 'completed' : ''}`} key={step}>
                      <div className={`bk-dot ${isDone ? 'completed' : isActive ? 'active' : ''}`}>
                        {isDone ? '✓' : ''}
                      </div>
                      <div className="bk-step-content">
                        <div className="bk-step-title">{info.label}</div>
                        {(isActive || isDone) && (
                          <div className="bk-step-desc">{info.subtitle}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Safe Guard Anti-Fraud Block */}
            <div className="bk-card" style={{ padding: 0, border: 'none' }}>
              <div className="guard-box">
                <div className="guard-header">
                  <span>🛡️ Secured by ChainGuard AI</span>
                  <span>Verifying...</span>
                </div>
                
                {/* Live Camera (if packing) */}
                {(order.status === 'packing' || order.status === 'placed') && currentZone && (
                  <CameraZoneView zoneId={currentZone.zoneId} streamUrl={currentZone.streamUrl} />
                )}

                {/* Scan Logs */}
                {scanLogs.length > 0 && (
                  <div style={{ padding: '0 16px' }}>
                    {scanLogs.map((s, i) => <ScanProofCard key={i} scan={s} />)}
                  </div>
                )}
              </div>
            </div>

            {/* QR Verification Hand-off (Only shown when out for delivery or packed) */}
            {(order.status === 'packed' || order.status === 'in_transit' || order.status === 'delivered') && (
              <div className="bk-card bk-verify-card">
                {order.status === 'delivered' || verifyResult?.status === 'VERIFIED' ? (
                  <div className="bk-success">
                    <div className="bk-success-icon">✓</div>
                    <div className="bk-success-title">Order Delivered</div>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 8 }}>
                      Cryptographically verified via ChainGuard.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bk-title">Delivery Verification</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      Show this QR code to your delivery partner. It proves the bag seal is intact.
                    </div>
                    {qrData && (
                      <div className="qr-center">
                        <div className="qr-box">
                          <QRCodeSVG value={qrData.tokenHash} size={150} fgColor="#111" />
                        </div>
                      </div>
                    )}
                    
                    {/* Demo token entry */}
                    <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 8 }}>Partner Demo Flow:</div>
                      <div className="bk-form-group" style={{ flexDirection: 'column' }}>
                        <input
                          className="bk-input"
                          placeholder="Delivery Partner scans QR..."
                          value={tokenInput}
                          onChange={e => setTokenInput(e.target.value)}
                        />
                        {qrData && (
                          <button className="bk-btn" style={{ background: '#eee', padding: 8 }} onClick={() => setTokenInput(qrData.tokenHash)}>
                            Auto-fill QR Hash
                          </button>
                        )}
                        <button className="bk-btn bk-btn-green" onClick={handleVerify} disabled={!tokenInput}>
                          Complete Delivery
                        </button>
                      </div>
                      {verifyResult && verifyResult.status !== 'VERIFIED' && (
                        <div style={{ color: '#e02424', fontSize: '0.8rem', marginTop: 8, padding: 8, background: '#fdefef', borderRadius: 4 }}>
                          ⚠️ {verifyResult.message}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Order Items Summary */}
            <div className="bk-card">
              <div className="bk-title">Bill Summary</div>
              {order.items.map((item, i) => (
                <div className="bk-item" key={i}>
                  <div style={{ fontSize: '0.9rem', color: '#333' }}>{item.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666', background: '#f4f4f4', padding: '2px 8px', borderRadius: 4 }}>
                    Qty: {item.quantity}
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 24 }}>
              <button 
                onClick={() => navigate('/')}
                style={{ background: 'none', border: 'none', color: '#007bb5', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}
              >
                ← Back to ChainGuard System
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
