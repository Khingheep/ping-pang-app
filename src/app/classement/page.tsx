'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

const world = [
  { rank:1, id:'timo', i:'TB', name:'Timo B.', city:'Allemagne', elo:2341, me:false },
  { rank:2, id:'ma', i:'ML', name:'Ma L.', city:'Chine', elo:2298, me:false },
  { rank:3, id:'hugo', i:'HC', name:'Hugo C.', city:'France', elo:2187, me:false },
  { rank:4, id:'sarah', i:'SK', name:'Sarah K.', city:'Japon', elo:2104, me:false },
  { rank:5, id:'ravi', i:'RP', name:'Ravi P.', city:'Inde', elo:2067, me:false },
  { rank:42, id:'lucas', i:'LT', name:'Lucas (toi)', city:'France', elo:1342, me:true },
]
const paris = [
  { rank:1, id:'hugo', i:'HC', name:'Hugo C.', city:'Lyon', elo:2187, me:false },
  { rank:2, id:'celine', i:'CM', name:'Céline M.', city:'Paris 11e', elo:1987, me:false },
  { rank:3, id:'antoine', i:'AR', name:'Antoine R.', city:'Paris 3e', elo:1876, me:false },
  { rank:4, id:'seb', i:'SK', name:'Seb K.', city:'Paris 10e', elo:1642, me:false },
  { rank:5, id:'amina', i:'AM', name:'Amina M.', city:'Paris 3e', elo:1480, me:false },
  { rank:12, id:'lucas', i:'LT', name:'Lucas (toi)', city:'Paris 11e', elo:1342, me:true },
]

export default function ClassementPage() {
  const [tab, setTab] = useState<'mondial' | 'paris'>('mondial')
  const router = useRouter()
  const list = tab === 'mondial' ? world : paris
  const me = list.find(p => p.me)
  const others = list.filter(p => !p.me)

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
          <div style={{ borderRadius:14, padding:'12px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:12, background:'var(--green-deep)', border:'0.5px solid var(--border-green)' }}>
            <span style={{ fontSize:24, fontWeight:700, color:'var(--green)' }}>#{me.rank}</span>
            <div>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Ta position {tab}</p>
              <p style={{ fontSize:11, color:'var(--text3)' }}>ELO {me.elo.toLocaleString('fr-FR')} · +18 ce mois</p>
            </div>
          </div>
        )}

        <div style={{ background:'var(--bg2)', borderRadius:16, border:'0.5px solid var(--border)' }}>
          {others.map((p, i) => (
            <div key={p.id+p.rank} onClick={() => router.push(`/profil/${p.id}`)} style={{ display:'flex', alignItems:'center', padding:'12px 14px', borderBottom:i<others.length-1?'0.5px solid var(--bg3)':'none', cursor:'pointer' }}>
              <span style={{ width:28, fontSize:13, fontWeight:700, color:i<3?'var(--green)':'var(--text3)', flexShrink:0 }}>{p.rank}</span>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, flexShrink:0 }}>{p.i}</div>
              <div style={{ flex:1, marginLeft:10 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{p.name}</p>
                <p style={{ fontSize:11, color:'var(--text3)' }}>{p.city}</p>
              </div>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{p.elo.toLocaleString('fr-FR')}</span>
            </div>
          ))}
          {me && (
            <>
              <div style={{ textAlign:'center', padding:'8px 0', color:'var(--text4)', fontSize:12 }}>· · ·</div>
              <div onClick={() => router.push(`/profil/${me.id}`)} style={{ display:'flex', alignItems:'center', padding:'12px 14px', background:'var(--green-deep)', borderRadius:'0 0 16px 16px', cursor:'pointer' }}>
                <span style={{ width:28, fontSize:13, fontWeight:700, color:'var(--green)', flexShrink:0 }}>{me.rank}</span>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, flexShrink:0 }}>{me.i}</div>
                <div style={{ flex:1, marginLeft:10 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{me.name}</p>
                  <p style={{ fontSize:11, color:'var(--text3)' }}>{me.city}</p>
                </div>
                <span style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{me.elo.toLocaleString('fr-FR')}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <NavBar />
    </div>
  )
}