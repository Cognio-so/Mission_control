import { useEffect, useRef } from 'react'
import { useTheme } from '../../lib/theme.js'

// Cursor-reactive constellation field on a <canvas>. Particles drift and link to
// each other; near the pointer they part around it and connect to it, with a soft
// glow following the cursor. On-brand for an agent node-graph. No deps; theme-aware;
// honours prefers-reduced-motion (renders a single static frame instead of animating).
export function InteractiveBackground({ className = '' }) {
  const canvasRef = useRef(null)
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const accent = isDark ? [79, 209, 181] : [47, 158, 138]
    const rgba = (a) => `rgba(${accent[0]},${accent[1]},${accent[2]},${a})`
    const dotAlpha = isDark ? 0.62 : 0.5
    const lineAlpha = isDark ? 0.5 : 0.4

    let width = 0
    let height = 0
    let particles = []
    let raf = 0
    const mouse = { x: -9999, y: -9999, active: false }
    const LINK = 130
    const MOUSE_LINK = 170
    const REPULSE = 110

    function seed() {
      const target = Math.max(28, Math.min(96, Math.floor((width * height) / 15000)))
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.34,
        r: Math.random() * 1.6 + 0.7,
      }))
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    function draw() {
      ctx.clearRect(0, 0, width, height)

      if (mouse.active) {
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 230)
        g.addColorStop(0, rgba(isDark ? 0.12 : 0.09))
        g.addColorStop(1, rgba(0))
        ctx.fillStyle = g
        ctx.fillRect(0, 0, width, height)
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const d2 = dx * dx + dy * dy
          if (d2 < REPULSE * REPULSE && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const force = ((REPULSE - d) / REPULSE) * 0.7
            p.x += (dx / d) * force
            p.y += (dy / d) * force
          }
        }

        if (p.x < -12) p.x = width + 12
        else if (p.x > width + 12) p.x = -12
        if (p.y < -12) p.y = height + 12
        else if (p.y > height + 12) p.y = -12

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK * LINK) {
            const a = (1 - Math.sqrt(d2) / LINK) * lineAlpha * 0.5
            ctx.strokeStyle = rgba(a)
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.stroke()
          }
        }

        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const d2 = dx * dx + dy * dy
          if (d2 < MOUSE_LINK * MOUSE_LINK) {
            const a = (1 - Math.sqrt(d2) / MOUSE_LINK) * lineAlpha
            ctx.strokeStyle = rgba(a)
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(mouse.x, mouse.y)
            ctx.stroke()
          }
        }

        ctx.fillStyle = rgba(dotAlpha)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.active = mouse.x >= -50 && mouse.x <= width + 50 && mouse.y >= -50 && mouse.y <= height + 50
    }
    const onLeave = () => { mouse.active = false }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseleave', onLeave)

    if (reduce) {
      draw()
      cancelAnimationFrame(raf)
    } else {
      raf = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [isDark])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />
}
