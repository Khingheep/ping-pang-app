'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

const venues = [
  { id:1, name:'Club PPP Oberkampf', address:'12 Rue de la Roquette, Paris 11e', type:'indoor', tables:8, elo:1420, players:24, dist:'0.8 km', open:true, x:48, y:42 },
  { id:2, name:'Ping Station République', address:'3 Place de la République, Paris 3e', type:'indoor', tables:6, elo:1280, players:12, dist:'1.4 km', open:true, x:52, y:28 },
  { id:3, name:'Tables Bastille', address:'Place de la Bastille, Paris 4e', type:'outdoor', tables:4, elo:1100, players:8, dist:'1.9 km', open:true, x:68, y:55 },
  { id:4, name:'Club Nation', address:'Bois de Vincennes, Paris 12e', type:'indoor', tables:12, elo:1650, players:31, dist:'3.2 km', open:false, x:78, y:62 },
  { id:5, name:'Tables Montmartre', address:'Place du Tertre, Paris 18e', type:'outdoor', tables:3, elo:980, players:5, dist:'4.1 km', open:true, x:35, y:18 },
]

export default function CartePage() {
  const [filter, setFilter] = useState('Tous')
  const [selected, setSelected] = useState<typeof venues[0]|null>(venues[0])
  const filters = ['Tous','Intérieur','Extérieur']
  const filtered = venues.filter(v => filter==='Tous' || (filter==='Intérieur'&&v.type==='indoor') || (filter==='Extérieur'&&v.type==='outdoor'))

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:520, background:'#0e1a14', zIndex:0, overflow:'hidden' }}>
        <svg width="100%" height="100%" style={{ opacity:0.15 }}>
          <defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#4aaa7a" strokeWidth="0.5"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
        {filtered.map(v=>(
          <div key={v.id} onClick={()=>setSelected(v)} style={{ position:'absolute', left:`${v.x}%`, top:`${v.y}%`, transform:'translate(-50%,-50%)', cursor:'pointer', zIndex:2 }}>
            <div style={{ width: selected?.id===v.id?20:14, height: selected?.id===v.id?20:14, borderRadius:'50%', background: v.type==='indoor'?'#4aaa7a':'#d0901c', border:`2px solid ${v.type==='indoor'?'#1a7a55':'#a06010'}`, transition:'all 0.2s', boxShadow: selected?.id===v.id?`0 0 0 4px ${v.type==='indoor'?'rgba(74,170,122,0.3)':'rgba(208,144,28,0.3)'}`:undefined }} />
            {selected?.id===v.id && <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)', background:'var(--bg2)', borderRadius:8, padding:'4px 8px', fontSize:11, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', border:'0.5px solid var(--border)' }}>{v.name}</div>}
          </div>
        ))}
        <div style={{ position:'absolute', top:0, left:0, right:0, background:'rgba(14,26,20,0.92)', padding:'12px 20px 8px', zIndex:3 }}>
          <p style={{ fontSize:22, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Carte</p>
          <div style={{ background:'var(--bg2)', borderRadius:12, padding:'8px 12px', border:'0.5px solid var(--border)', fontSize:13, color:'var(--text4)', marginBottom:10 }}>🔍 Rechercher une table...</div>
          <div style={{ display:'flex', gap:8 }}>
            {filters.map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:filter===f?'var(--green-dark)':'var(--bg2)', border:`0.5px solid ${filter===f?'var(--border-green)':'var(--border)'}`, color:filter===f?'var(--text)':'var(--text3)' }}>{f}</button>
            ))}
          </div>
        </div>
        <div style={{ position:'absolute', bottom:8, left:20, background:'var(--bg2)', borderRadius:10, padding:'6px 10px', border:'0.5px solid var(--border)', display:'flex', gap:12, alignItems:'center', zIndex:3 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, borderRadius:'50%', background:'#4aaa7a' }}/><span style={{ fontSize:10, color:'var(--text2)' }}>Intérieur</span></div>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, borderRadius:'50%', background:'#d0901c' }}/><span style={{ fontSize:10, color:'var(--text2)' }}>Extérieur</span></div>
        </div>
      </div>

      {selected && (
        <div style={{ position:'absolute', bottom:84, left:0, right:0, background:'#161616', borderRadius:'20px 20px 0 0', padding:20, borderTop:'0.5px solid var(--border)', zIndex:10 }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'var(--border)', margin:'0 auto 16px' }}/>
          <p style={{ fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:8 }}>{selected.name}</p>
          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:selected.type==='indoor'?'var(--green-deep)':'var(--orange-deep)', border:`0.5px solid ${selected.type==='indoor'?'var(--border-green)':'var(--orange)'}`, color:selected.type==='indoor'?'var(--green)':'var(--orange)' }}>{selected.type==='indoor'?'Intérieur':'Extérieur'}</span>
            <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, background:'var(--bg)', border:'0.5px solid var(--border)', color:'var(--text3)' }}>{selected.tables} tables</span>
            <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background: selected.open?'#0a2c0e':'#2e0e0e', border:`0.5px solid ${selected.open?'#197a26':'#7a1a1a'}`, color:selected.open?'#4acc66':'var(--red)' }}>{selected.open?'Ouvert':'Fermé'}</span>
          </div>
          <p style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>📍 {selected.address}</p>
          <div style={{ background:'var(--bg)', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', justifyContent:'space-between' }}>
            {[{val:selected.players,lbl:'Joueurs actifs'},{val:selected.elo.toLocaleString('fr-FR'),lbl:'ELO moyen'},{val:selected.dist,lbl:'Distance'}].map(s=>(
              <div key={s.lbl} style={{ textAlign:'center' }}>
                <p style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{s.val}</p>
                <p style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{s.lbl}</p>
              </div>
            ))}
          </div>
          <button style={{ width:'100%', height:46, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
            VOIR LES JOUEURS ICI
          </button>
        </div>
      )}
      <NavBar />
    </div>
  )
}
