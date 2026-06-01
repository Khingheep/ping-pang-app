'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

const world = [
  { rank:1, id:'timo', i:'TB', name:'Timo B.', city:'Allemagne', elo:2341 },
  { rank:2, id:'ma', i:'ML', name:'Ma L.', city:'Chine', elo:2298 },
  { rank:3, id:'hugo', i:'HC', name:'Hugo C.', city:'France', elo:2187 },
  { rank:4, id:'sarah', i:'SK', name:'Sarah K.', city:'Japon', elo:2104 },
  { rank:5, id:'ravi', i:'RP', name:'Ravi P.', city:'Inde', elo:2067 },
  { rank:42, id:'lucas', i:'LT', name:'Lucas (toi)', city:'France', elo:1342, me:true },
]
const paris = [
  { rank:1, id:'hugo', i:'HC', name:'Hugo C.', city:'Lyon', elo:2187 },
  { rank:2, id:'celine', i:'CM', name:'Céline M.', city:'Paris 11e', elo:1987 },
  { rank:3, id:'antoine', i:'AR', name:'Antoine R.', city:'Paris 3e', elo:1876 },
  { rank:4, id:'seb', i:'SK', name:'Seb K.', city:'Paris 10e', elo:1642 },
  { rank:5, id:'amina', i:'AM', name:'Amina M.', city:'Paris 3e', elo:1480 },
  { rank:12, id:'lucas', i:'LT', name:'Lucas (toi)', city:'Paris 11e', elo:1342, me:true },
]

export default function ClassementPage() {
  const [tab, setTab] = useState<'mondial' | 'paris'>('mondial')
  const router = useRouter()
  const list = (tab === 'mondial' ? world : paris) as any[]
  const me = list.find(p => p.me)
  const others = list.filter(p => !p.me)

  const rowStyle = (p: any, i: number, total: number): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: p.me ? '12px 8px' : '12px 14px',
    borderBottom: i < total - 1 ? '0.5px solid var(--bg3)' : 'none',
    cursor: 'pointer',
    background: p.me ? 'var(--green-deep)' : undefined,
    borderRadius: p.me ? 8 : undefined,
  })

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <p style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>Classement</p>
          <div style={{ display:'flex', gap:6 }}>
            {(['mondial','paris'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:tab===t?'var(--green-dark)':'var(--bg2)', border:`0.5px solid ${tab===t?'var(--border-green)':'var(--border)'}`, color:tab===t?'var(--text)':'var(--text3)' }}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {me && (
          <div style={{ bord