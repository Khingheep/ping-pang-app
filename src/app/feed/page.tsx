'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

const Av = ({ i, color='#4aaa7a', bg='#0d2d1e', border='#1a7a55' }: { i:string; color?:string; bg?:string; border?:string }) => (
  <div style={{ width:36, height:36, borderRadius:'50%', background:bg, border:`1px solid ${border}`, color, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, flexShrink:0 }}>{i}</div>
)

export default function FeedPage() {
  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px 6px', borderBottom:'0.5px solid #1a1a1a' }}>
        <span style={{ fontSize:20, fontWeight:700, color:'var(--text)', letterSpacing:1 }}>PING PANG</span>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--bg2)', border:'0.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🔔</div>
      </div>
      <div style={{ padding:'0 20px' }}>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginTop:16, marginBottom:10 }}>NOUVEAUX JOUEURS</p>
        <div style={{ display:'flex', gap:16, marginBottom:16 }}>
          {[['LT','Lucas'],['AM','Amina'],['SK','Seb'],['RP','Rania'],['JC','Jules']].map(([i,n])=>(
            <div key={n} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:17 }}>{i}</div>
              <span style={{ fontSize:10, color:'var(--text3)' }}>{n}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:10 }}>ACTIVITÉ RÉCENTE</p>
        <div style={{ background:'var(--bg2)', borderRadius:14, padding:14, marginBottom:10, border:'0.5px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <Av i="LT" />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Lucas T. a rejoint</p>
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Il y a 12 min · Paris</p>
            </div>
            <div style={{ background:'var(--green-deep)', border:'0.5px solid var(--border-green)', borderRadius:20, padding:'4px 8px', fontSize:10, fontWeight:600, color:'var(--green)' }}>NOUVEAU</div>
          </div>
          <p style={{ fontSize:12, color:'var(--text3)', marginTop:10 }}>Attaquant confirmé · ELO 1500</p>
          <div style={{ background:'var(--green-deep)', border:'0.5px solid var(--border-green)', borderRadius:11, padding:'4px 8px', display:'inline-flex', marginTop:8, fontSize:11, fontWeight:600, color:'var(--green)' }}>⚡ 1500</div>
        </div>
        <div style={{ background:'var(--bg2)', borderRadius:14, padding:14, marginBottom:10, border:'0.5px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <Av i="AM" />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Amina M. a gagné</p>
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Il y a 1h · Club PPP Oberkampf</p>
            </div>
            <div style={{ background:'#1a1a00', borderRadius:20, padding:'4px 8px', fontSize:10, fontWeight:600, color:'#aaaa4a' }}>MATCH</div>
          </div>
          <div style={{ background:'#0d0d0d', borderRadius:8, padding:'8px 12px', marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'var(--text2)' }}>Amina M.</span>
            <span style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>3 — 1</span>
            <span style={{ fontSize:12, color:'var(--text2)' }}>Seb K.</span>
          </div>
          <div style={{ background:'var(--green-deep)', border:'0.5px solid var(--border-green)', borderRadius:11, padding:'4px 8px', display:'inline-flex', marginTop:8, fontSize:11, fontWeight:600, color:'var(--green)' }}>+18 ELO</div>
        </div>
        <div style={{ background:'var(--bg2)', borderRadius:14, padding:14, border:'0.5px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'#1a0d2e', border:'1px solid #3a2060', color:'#8a6aaa', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>SK</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Seb K. — nouveau rang</p>
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Il y a 3h</p>
            </div>
            <div style={{ background:'#1a0d2e', borderRadius:20, padding:'4px 8px', fontSize:10, fontWeight:600, color:'#8a6aaa' }}>CLASSEMENT</div>
          </div>
          <p style={{ fontSize:12, color:'var(--text3)', marginTop:10 }}>Seb vient d'entrer dans le Top 100 Paris (ELO 1642)</p>
        </div>
      </div>
      <NavBar />
    </div>
  )
}
