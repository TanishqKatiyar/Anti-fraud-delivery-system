import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder, getProducts } from '../lib/api.js'
import './LandingPage.css'

const ROLES = [
  {
    id: 'customer',
    icon: '🛒',
    title: 'Customer App',
    subtitle: 'Track your order live',
    desc: 'Watch every item get scanned in real-time. Get notified the moment your bag is sealed with a tamper-proof QR.',
    color: 'cyan',
    path: '/customer',
  },
  {
    id: 'packer',
    icon: '📋',
    title: 'Packer Tablet',
    subtitle: 'Warehouse picking UI',
    desc: 'See the GREEN / RED Omni-Scanner signal for each product. Pick items, trigger AI scans, seal the bag.',
    color: 'jade',
    path: '/packer',
  },
  {
    id: 'dashboard',
    icon: '🖥️',
    title: 'Admin Dashboard',
    subtitle: 'Warehouse oversight',
    desc: 'Real-time order grid, scan approval rates, fraud alert log and live order volume charts.',
    color: 'amber',
    path: '/dashboard',
  },
]

const FEATURES = [
  { icon: '🔒', label: 'HMAC-SHA256 QR', desc: 'Cryptographic one-time delivery tokens — uncloneable' },
  { icon: '🤖', label: 'YOLOv8 AI Vision', desc: 'Product identity verification at packing speed' },
  { icon: '📅', label: 'EasyOCR Expiry', desc: 'Real-time expiry date extraction from packaging' },
  { icon: '📡', label: 'Live Socket.io', desc: 'Sub-second event streaming across all 3 UIs' },
  { icon: '📸', label: 'S3 Proof Images', desc: 'Every scan generates tamper-proof audit evidence' },
  { icon: '🎥', label: 'Multi-Camera Zones', desc: '4-angle warehouse camera routing per item zone' },
]

// Animated node graph
function NodeGraph() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const nodes = Array.from({ length: 20 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 3 + 1,
    }))

    let raf
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      })
      nodes.forEach((a, i) => {
        nodes.forEach((b, j) => {
          if (i >= j) return
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(0,212,255,${(1 - dist / 150) * 0.3})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        })
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.fillStyle = '#00d4ff'
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={canvasRef} className="node-graph" />
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(false)
  const [demoOrderId, setDemoOrderId] = useState(null)
  const [error, setError] = useState(null)

  async function handleStartDemo() {
    setLaunching(true)
    setError(null)
    try {
      const { data: prodData } = await getProducts()
      const products = prodData.products || []
      if (products.length === 0) throw new Error('No products in DB. Run seed script first.')

      const items = products.slice(0, 3).map(p => ({ productId: p.productId, quantity: 1 }))
      const { data } = await createOrder('demo_customer_001', items)
      const id = data.order._id
      setDemoOrderId(id)
      navigate(`/customer?orderId=${id}`)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
      setLaunching(false)
    }
  }

  return (
    <div className="landing">
      {/* Background glows */}
      <div className="glow-blob" style={{ width: 600, height: 600, background: 'rgba(0,212,255,0.06)', top: -200, left: -200 }} />
      <div className="glow-blob" style={{ width: 400, height: 400, background: 'rgba(0,255,136,0.05)', bottom: 0, right: -100 }} />

      {/* Header */}
      <header className="landing-header">
        <div className="landing-logo">
          <span className="logo-icon">⛓️</span>
          <span className="logo-text">Chain<span style={{ color: 'var(--cyan)' }}>Guard</span></span>
        </div>
        <div className="header-badge">
          <span className="status-dot cyan" />
          Demo Mode Active
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <NodeGraph />
        <div className="hero-content">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="hero-eyebrow">
              <span className="badge badge-cyan">Ultra-Transparent</span>
              <span className="badge badge-jade">AI-Powered</span>
              <span className="badge badge-muted">Anti-Fraud</span>
            </div>
            <h1 className="hero-title">
              Supply Chain You Can<br />
              <span className="hero-gradient">See Through</span>
            </h1>
            <p className="hero-subtitle">
              Every item scanned. Every bag sealed. Every delivery verified.
              <br />Real-time AI vision + cryptographic QR tokens eliminate fraud at every step.
            </p>
            <div className="hero-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleStartDemo}
                disabled={launching}
                id="start-demo-btn"
              >
                {launching ? (
                  <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Creating Demo Order…</>
                ) : (
                  <><span>🚀</span> Start Live Demo</>
                )}
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => navigate('/dashboard')}>
                <span>🖥️</span> View Dashboard
              </button>
            </div>
            {error && (
              <motion.div
                className="hero-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                ⚠️ {error}. Make sure the backend is running and the DB is seeded.
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Role Cards */}
      <section className="roles-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Three Perspectives. One System.</h2>
          </div>
          <div className="roles-grid">
            {ROLES.map((role, i) => (
              <motion.div
                key={role.id}
                className={`role-card role-card--${role.color}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                onClick={() => navigate(role.path)}
                id={`role-${role.id}`}
              >
                <div className="role-icon">{role.icon}</div>
                <div className="role-meta">
                  <h3>{role.title}</h3>
                  <p className="role-subtitle">{role.subtitle}</p>
                </div>
                <p className="role-desc">{role.desc}</p>
                <button className={`btn btn-${role.color === 'cyan' ? 'primary' : role.color === 'jade' ? 'jade' : 'ghost'} btn-sm`}>
                  Open →
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="features-section">
        <div className="container">
          <h2 className="section-title text-center mb-lg">Built for Zero-Trust Delivery</h2>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                className="feature-card glass-card"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.07 }}
              >
                <span className="feature-icon">{f.icon}</span>
                <div>
                  <div className="feature-label">{f.label}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span className="text-muted text-mono">ChainGuard © 2025 · Demo Mode</span>
        <div className="footer-links">
          <span className="badge badge-jade">✓ Backend Running</span>
          <span className="badge badge-cyan">✓ AI Service Ready</span>
        </div>
      </footer>
    </div>
  )
}
