import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export default api

// ── Orders ────────────────────────────────────────────────────────────────

export const createOrder = (customerId, items) =>
  api.post('/orders', { customerId, items })

export const getOrder = (id) => api.get(`/orders/${id}`)

export const updateOrderStatus = (id, status) =>
  api.patch(`/orders/${id}/status`, { status })

// ── Products ──────────────────────────────────────────────────────────────

export const getProducts = () => api.get('/products')

// ── QR / Delivery ─────────────────────────────────────────────────────────

export const generateQR = (orderId) => api.post('/generate-qr', { orderId })

export const verifyDelivery = (token, orderId) =>
  api.post('/verify-delivery', { token, orderId })

// ── Demo helpers ──────────────────────────────────────────────────────────

export const triggerMockScan = (orderId, productId, category, expectedClass) => {
  // Use /ai-scan proxy (routed through nginx or vite proxy to AI service)
  const dummy = new Blob(['dummy'], { type: 'image/jpeg' })
  const fd = new FormData()
  fd.append('orderId', orderId)
  fd.append('productId', productId)
  fd.append('category', category)
  fd.append('expectedClass', expectedClass || 'bottle')
  fd.append('frames', dummy, 'frame.jpg')
  return axios.post('/ai-scan/api/omni-scan', fd)
}
