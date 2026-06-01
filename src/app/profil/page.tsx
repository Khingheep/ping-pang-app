'use client'
import dynamic from 'next/dynamic'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })

export default function ProfilPage() {
  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ background:'#0c1510', textAlign:'center', paddingTop:46, paddingBottom:0 }}>
        <div style={{ width:88, height:88, borderRadius:'50%', background:'var(--green-deep)', border:'2px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:28, margin:'0 auto 12px' }}>LT</div>
        <p style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>Lucas Thevenot</p>
        <p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>Paris · France</p>
        <div style={{ display:'inline-flex', padding:'5px 12px', borderRadius:20, background:'var(--green-deep)', border:'0.5px solid var(--border-green)', color:'var(--green)', fontSize:11, fontWeight:600, marginTop:8 }}>Attaquant · Droitier</div>
        <div style={{ display:'flex', justifyContent:'center', gap:12, padding:'16px 24px' }}>
          <button style={{ flex:1, height:40, borderRadius:10, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>Message</button>
          <button style={{ flex:1, height:40, borderRadius:10, background:'var(--bg2)', color:'var(--text)', border:'0.5px solid var(--border)', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>Défier</button>
        </div>
      </div>
      <div style={{ background:'var(--green-deep)', border:'0.5px solid var(--border-green)', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)' }}>ELO MONDIAL</p>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:2 }}>
            <p style={{ fontSize:28, fontWeight:700, color:'var(--text)' }}>1 642</p>
            <p style={{ fontSize:12, color:'var(--green)' }}>+18 cette semaine</p>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--text3)' }}>CLASSEMENT</p>
          <p style={{ fontSize:18, fontWeight:700, color:'var(--text)', marginTop:2 }}>#47 Paris</p>
        </div>
      </div>
      <div style={{ padding:'0 24px' }}>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginTop:20, marginBottom:10 }}>STATISTIQUES</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
          {[{val:'127',lbl:'Matchs joués'},{val:'73%',lbl:'Victoires'},{val:'12',lbl:'Tables visitées'},{val:'8',lbl:'Tournois'}].map(s=>(
            <div key={s.lbl} style={{ background:'var(--bg2)', borderRadius:12, padding:'14px', border:'0.5px solid var(--border)' }}>
              <p style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>{s.val}</p>
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{s.lbl}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:10 }}>PROGRESSION ELO</p>
        <div style={{ background:'var(--bg2)', borderRadius:12, padding:14, marginBottom:20, border:'0.5px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <p style={{ fontSize:9, color:'var(--text4)' }}>30 derniers jours</p>
            <p style={{ fontSize:9, color:'var(--green)', fontWeight:600 }}>1 642</p>
          </div>
          <svg width="100%" height="60" viewBox="0 0 300 60">
            <polyline points="0,55 30,50 60,52 90,42 120,38 150,30 180,22 210,18 240,12 270,8 300,4" fill="none" stroke="var(--green-dark)" strokeWidth="1.5"/>
            {[[0,55],[30,50],[60,52],[90,42],[120,38],[150,30],[180,22],[210,18],[240,12],[270,8],[300,4]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="3" fill="var(--green)" />
            ))}
          </svg>
        </div>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:10 }}>DERNIERS MATCHS</p>
        {[{res:'V',opp:'Amina M.',score:'3-1',pts:'+18',day:'Hier',win:true},{res:'D',opp:'Seb K.',score:'1-3',pts:'-12',day:'Lun',win:false},{res:'V',opp:'Jules C.',score:'3-0',pts:'+14',day:'Sam',win:true}].map(m=>(
          <div key={m.opp} style={{ background:'var(--bg2)', borderRadius:10, padding:'10px 14px', marginBottom:6, border:'0.5px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:26, height:26, borderRadius:6, background:m.win?'var(--green-deep)':'var(--red-deep)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:m.win?'var(--green)':'var(--red)' }}>{m.res}</div>
            <p style={{ flex:1, fontSize:13, fontWeight:500, color:'var(--text)' }}>{m.opp}</p>
            <p style={{ fontSize:12, color:'var(--text3)' }}>{m.score}</p>
            <div style={{ textAlign:'right', minWidth:36 }}>
              <p style={{ fontSize:12, fontWeight:600, color:m.win?'var(--green)':'var(--red)' }}>{m.pts}</p>
              <p style={{ fontSize:10, color:'var(--text4)' }}>{m.day}</p>
            </div>
          </div>
        ))}
      </div>
      <NavBar />
    </div>
  )
}
