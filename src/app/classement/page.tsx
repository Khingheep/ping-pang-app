'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

const world = [
  { rank:1, i:'TB', name:'Timo B.', city:'Allemagne', elo:2341, me:false },
  { rank:2, i:'ML', name:'Ma L.', city:'Chine', elo:2298, me:false },
  { rank:3, i:'HC', name:'Hugo C.', city:'France', elo:2187, me:false },
  { rank:4, i:'SK', name:'Sarah K.', city:'Japon', elo:2104, me:false },
  { rank:5, i:'RP', name:'Ravi P.', city:'Inde', elo:2067, me:false },
  { rank:42, i:'LT', name:'Lucas (toi)', city:'France', elo:1342, me:true },
]
const paris = [
  { rank:1, i:'HC', name:'Hugo C.', city:'Lyon 9e', elo:2187, me:false },
  { rank:2, i:'CM', name:'Céline M.', city:'Paris 11e', elo:1987, me:false },
  { rank:3, i:'AR', name:'Antoine R.', city:'Paris 3e', elo:1876, me:false },
  { rank:4, i:'LT', name:'Lucas (toi)', city:'Paris 11e', elo:1342, me:true },
]

export default function ClassementPage() {
  const [tab, setTab] = useState<'mondial'|'paris'>('mondial')
  const list = tab==='mondial' ? world : paris

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <p style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>Classement</p>
          <div style={{ display:'flex', gap:6 }}>
            {(['mondial','paris'] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:tab===t?'var(--green-dark)':'var(--bg2)', border:`0.5px solid ${tab===t?'var(--border-green)':'var(--border)'}`, color:tab===t?'var(--text)':'var(--text3)' }}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderRadius:14, padding:'12px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:12, background:'var(--green-deep)', border:'0.5px solid var(--border-green)' }}>
          <span style={{ fontSize:24, fontWeight:700, color:'var(--green)' }}>{tab==='mondial'?'#42':'#4'}</span>
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Ta position {tab}</p>
            <p style={{ fontSize:11, color:'var(--text3)' }}>ELO 1 342 · +18 ce mois</p>
          </div>
        </div>

        <div style={{ background:'var(--bg2)', borderRadius:16, padding:'4px 14px', border:'0.5px solid var(--border)' }}>
          {list.map((p,i)=>(
            <div key={p.name} style={{ display:'flex', alignItems:'center', padding:'12px 0', borderBottom: i<list.length-1?'0.5px solid var(--bg3)':'none', background:p.me?'var(--green-deep)':undefined, borderRadius:p.me?8:undefined, padding:p.me?'12px 8px':'12px 0' }}>
              <span style={{ width:28, fontSize:13, fontWeight:700, color:i<3?'var(--green)':'var(--text3)' }}>{p.rank}</span>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, flexShrink:0 }}>{p.i}</div>
              <div style={{ flex:1, marginLeft:10 }}>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{p.name}</p>
                <p style={{ fontSize:11, color:'var(--text3)' }}>{p.city}</p>
              </div>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{p.elo.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      </div>
      <NavBar />
    </div>
  )
}
