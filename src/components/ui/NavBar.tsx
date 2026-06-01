'use client'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  { label: 'Feed',  href: '/feed' },
  { label: 'Rank',  href: '/classement' },
  { label: 'Jouer', href: '/jouer' },
  { label: 'Carte', href: '/carte' },
  { label: 'Profil',href: '/profil' },
]

function ease(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t }

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({
    bx: 0, by: 0,
    aFrom: 0, aTo: 0,
    aT: 1, dur: 300,
    last: null as number | null,
    trail: [] as {x:number,y:number}[],
    cur: 0,
    raf: null as number | null,
  })

  // Draw function stored in ref so animate can always access latest
  const drawRef = useRef<(() => void) | null>(null)
  const goRef = useRef<((idx: number) => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.getContext('2d')!
    const W = 390, H = 84, N = 5, TW = W / N
    const TX = Array.from({length:N}, (_,i) => TW*i + TW/2)
    const TY = 32, NET_H = 14, R = 8, TRAIL = 50
    const s = state.current

    // Init ball position
    const initIdx = TABS.findIndex(t => pathname.startsWith(t.href))
    s.cur = initIdx === -1 ? 0 : initIdx
    s.bx = TX[s.cur]
    s.by = TY
    s.aFrom = s.bx
    s.aTo = s.bx

    function drawStatic() {
      // Table line
      cx.strokeStyle = '#2a2a2a'
      cx.lineWidth = 2
      cx.lineCap = 'round'
      cx.beginPath()
      cx.moveTo(0, TY)
      cx.lineTo(W, TY)
      cx.stroke()

      // Net
      cx.strokeStyle = '#3a3a3a'
      cx.lineWidth = 2
      cx.beginPath()
      cx.moveTo(W/2, TY - NET_H)
      cx.lineTo(W/2, TY + 4)
      cx.stroke()
      cx.fillStyle = '#3a3a3a'
      cx.beginPath()
      cx.arc(W/2, TY - NET_H, 3, 0, Math.PI*2)
      cx.fill()

      // Labels
      TABS.forEach((t, i) => {
        const active = i === s.cur
        const tx = TW*i + TW/2
        if (i > 0) {
          cx.strokeStyle = '#1a1a1a'
          cx.lineWidth = 0.5
          cx.setLineDash([])
          cx.beginPath()
          cx.moveTo(TW*i, TY + 6)
          cx.lineTo(TW*i, TY + 38)
          cx.stroke()
        }
        cx.fillStyle = active ? '#f5f5f5' : '#444'
        cx.font = `${active ? 700 : 500} 8.5px Inter, sans-serif`
        cx.textAlign = 'center'
        cx.fillText(t.label.toUpperCase(), tx, TY + 20)
        if (active) {
          cx.fillStyle = '#4aaa7a'
          cx.beginPath()
          cx.arc(tx, TY + 28, 2, 0, Math.PI*2)
          cx.fill()
        }
      })
    }

    function drawTrail() {
      const trail = s.trail
      if (trail.length < 2) return
      for (let i = 1; i < trail.length; i++) {
        const t0 = trail[i-1], t1 = trail[i]
        const p = i / trail.length
        const alpha = p * p * p * 0.85
        const w = p * 5
        const g = cx.createLinearGradient(t0.x, t0.y, t1.x, t1.y)
        g.addColorStop(0, `rgba(26,122,85,${alpha*0.4})`)
        g.addColorStop(0.5, `rgba(74,170,122,${alpha*0.7})`)
        g.addColorStop(1, `rgba(100,210,150,${alpha})`)
        cx.strokeStyle = g
        cx.lineWidth = w
        cx.lineCap = 'round'
        cx.beginPath()
        cx.moveTo(t0.x, t0.y)
        cx.lineTo(t1.x, t1.y)
        cx.stroke()
      }
      const tip = trail[trail.length-1]
      const glow = cx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14)
      glow.addColorStop(0, 'rgba(74,170,122,0.25)')
      glow.addColorStop(1, 'rgba(74,170,122,0)')
      cx.fillStyle = glow
      cx.beginPath()
      cx.arc(tip.x, tip.y, 14, 0, Math.PI*2)
      cx.fill()
    }

    function drawBall() {
      const bx = s.bx, by = s.by
      cx.save()
      cx.translate(bx, by)
      const lift = Math.max(0, TY - by)
      const shA = Math.max(0, 0.4 - lift/22)
      const shW = Math.max(2, R*(1 - lift/30))
      cx.fillStyle = `rgba(0,0,0,${shA})`
      cx.beginPath()
      cx.ellipse(0, TY-by+R+1, shW*0.85, 2, 0, 0, Math.PI*2)
      cx.fill()
      const base = cx.createRadialGradient(-R*0.3,-R*0.35,0,R*0.05,R*0.05,R*1.15)
      base.addColorStop(0,'#ffffff')
      base.addColorStop(0.25,'#f8f8f5')
      base.addColorStop(0.6,'#e8e5d8')
      base.addColorStop(1,'#c8c4b2')
      cx.fillStyle = base
      cx.beginPath()
      cx.arc(0,0,R,0,Math.PI*2)
      cx.fill()
      const rim = cx.createRadialGradient(0,0,R*0.5,0,0,R)
      rim.addColorStop(0,'rgba(0,0,0,0)')
      rim.addColorStop(1,'rgba(0,0,0,0.25)')
      cx.fillStyle = rim
      cx.beginPath()
      cx.arc(0,0,R,0,Math.PI*2)
      cx.fill()
      const spec = cx.createRadialGradient(-R*0.3,-R*0.32,0,-R*0.18,-R*0.2,R*0.52)
      spec.addColorStop(0,'rgba(255,255,255,1)')
      spec.addColorStop(0.4,'rgba(255,255,255,0.5)')
      spec.addColorStop(1,'rgba(255,255,255,0)')
      cx.fillStyle = spec
      cx.beginPath()
      cx.arc(0,0,R,0,Math.PI*2)
      cx.fill()
      cx.restore()
    }

    function draw() {
      cx.clearRect(0,0,W,H)
      drawStatic()
      drawTrail()
      drawBall()
    }
    drawRef.current = draw

    function getBallPos(t: number) {
      const et = ease(t)
      const x = s.aFrom + (s.aTo - s.aFrom) * et
      const cross = (s.aFrom < W/2 && s.aTo > W/2) || (s.aFrom > W/2 && s.aTo < W/2)
      const dist = Math.abs(s.aTo - s.aFrom)
      const segs = Math.max(1, Math.round(dist / TW))
      const nh = cross ? 22 : 13
      const y = TY - Math.abs(Math.sin(t * Math.PI * segs)) * nh
      return { x, y }
    }

    function animate(ts: number) {
      if (!s.last) s.last = ts
      const dt = Math.min((ts - s.last)/1000, 0.05)
      s.last = ts
      s.aT = Math.min(1, s.aT + dt/(s.dur/1000))
      const pos = getBallPos(s.aT)
      s.bx = pos.x
      s.by = pos.y
      s.trail.push({x: s.bx, y: s.by})
      if (s.trail.length > TRAIL) s.trail.shift()
      draw()
      if (s.aT < 1) {
        s.raf = requestAnimationFrame(animate)
      } else {
        s.by = TY
        s.trail = []
        draw()
        s.last = null
      }
    }

    function go(idx: number) {
      if (idx === s.cur) return
      s.cur = idx
      s.aFrom = s.bx
      s.aTo = TX[idx]
      s.dur = Math.max(220, Math.abs(s.aTo - s.aFrom) * 1.5)
      s.aT = 0
      s.last = null
      s.trail = []
      if (s.raf) cancelAnimationFrame(s.raf)
      s.raf = requestAnimationFrame(animate)
    }
    goRef.current = go

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) * (W / rect.width)
      const idx = Math.max(0, Math.min(N-1, Math.floor(x / TW)))
      go(idx)
      router.push(TABS[idx].href)
    })

    draw()

    return () => {
      if (s.raf) cancelAnimationFrame(s.raf)
    }
  }, [])

  // React to route changes
  useEffect(() => {
    const idx = TABS.findIndex(t => pathname.startsWith(t.href))
    if (idx !== -1 && goRef.current) {
      goRef.current(idx)
    }
  }, [pathname])

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 390,
      background: '#121212',
      borderTop: '0.5px solid #1a1a1a',
      zIndex: 100,
    }}>
      <canvas
        ref={canvasRef}
        width={390}
        height={84}
        style={{ display: 'block', width: '100%', height: 84, cursor: 'pointer' }}
      />
    </div>
  )
}
