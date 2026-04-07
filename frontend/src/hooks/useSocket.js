import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = 'http://localhost:5001'

export function useSocket(orderId) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState(null)

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      if (orderId) socket.emit('join', orderId)
    })

    socket.on('disconnect', () => setConnected(false))

    const events = [
      'order:zone-assigned',
      'order:status-update',
      'order:prep-image-ready',
      'order:delivered',
      'scan:proof',
      'scanner:result',
      'stream:init',
      'stream:switch',
      'stream:end',
      'order:packed',
    ]

    events.forEach(event => {
      socket.on(event, data => setLastEvent({ type: event, data, ts: Date.now() }))
    })

    return () => {
      socket.disconnect()
    }
  }, [orderId])

  const joinRoom = useCallback((roomId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', roomId)
    }
  }, [])

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data)
  }, [])

  return { connected, lastEvent, emit, joinRoom, socket: socketRef }
}
