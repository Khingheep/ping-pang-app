'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

export default function JouerPage() {
  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0' }}>
        <p style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>Jouer</p>
        <p style={{ fontSize:13, color:'var(--text3)', marginTop:2, marginBottom:24 }}>Crée ou rejoins une partie</p>
        <Link href="/jouer/defi">
          <div style={{ borderRadius:16, padding:'20px 16px', marginBottom:12, cursor:'pointer', background:'var(--green-deep)', border:'0.5px solid var(--border-green)', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(74,170,122,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>⚔️</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Défi</p>
              <p style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>1v1 classé ou amical</p>
            </div>
            <span style={{ fontSize:18, fontWeight:700, color:'var(--green-dark)' }}>→</span>
          </div>
        </Link>
        <Link href="/jouer/tournoi">
          <div style={{ borderRadius:16, padding:'20px 16px', marginBottom:12, cursor:'pointer', background:'var(--orange-deep)', border:'0.5px solid var(--orange)', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(208,144,28,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🏆</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Tournoi</p>
              <p style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>Organise une compétition</p>
            </div>
            <span style={{ fontSize:18, fontWeight:700, color:'var(--orange)' }}>→</span>
          </div>
        </Link>
        <div style={{ borderRadius:16, padding:'20px 16px', marginBottom:24, cursor:'pointer', background:'var(--purple-deep)', border:'0.5px solid #573877', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(138,106,170,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🎉</div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Événement</p>
            <p style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>Soirée, session libre...</p>
          </div>
          <span style={{ fontSize:18, fontWeight:700, color:'var(--purple)' }}>→</span>
        </div>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:10 }}>DÉFIS EN ATTENTE</p>
        {[
          { i:'AM', name:'Amina M.', sub:'Défi classé · ELO 1 480', time:'Il y a 2h', status:'En attente', sc:'var(--orange)', sb:'var(--orange-deep)', sbc:'var(--orange)' },
          { i:'RP', name:'Rania P.', sub:'Match amical · ELO 1 320', time:'Hier', status:'Accepté', sc:'var(--green)', sb:'var(--green-deep)', sbc:'var(--border-green)' },
        ].map(p=>(
          <div key={p.name} style={{ background:'var(--bg2)', borderRadius:12, padding:14, marginBottom:8, border:'0.5px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>{p.i}</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{p.name}</p>
              <p style={{ fontSize:11, color:'var(--text3)' }}>{p.sub}</p>
              <p style={{ fontSize:10, color:'var(--text4)', marginTop:2 }}>{p.time}</p>
            </div>
            <div style={{ background:p.sb, border:`0.5px solid ${p.sbc}`, borderRadius:20, padding:'3px 8px', fontSize:10, fontWeight:600, color:p.sc }}>{p.status}</div>
          </div>
        ))}
      </div>
      <NavBar />
    </div>
  )
}
