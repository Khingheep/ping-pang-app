'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

const levels = [
  { label:'Débutant', sub:'Je découvre le sport', elo:1000 },
  { label:'Intermédiaire', sub:'Je joue régulièrement', elo:1200 },
  { label:'Confirmé', sub:'Compétitions locales', elo:1500 },
  { label:'Expert', sub:'Classé nationalement', elo:1800 },
]
const sources = ['Instagram','TikTok','Un ami / joueur','Club Ping Pang Paris','Recherche internet','Autre']
const goals = ['Défier des joueurs','Progresser','Tournois','Rencontrer des joueurs','Trouver des tables','Être classé']
const styles = ['Attaquant','Défenseur','Polyvalent','Coupeur']

function ProgressBar({ step, total }: { step:number; total:number }) {
  return (
    <div style={{ display:'flex', gap:6, marginBottom:8 }}>
      {Array.from({length:total}).map((_,i)=>(
        <div key={i} style={{ height:2, flex:1, borderRadius:2, background: i<step?'var(--green-dark)':'var(--border)' }} />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [hand, setHand] = useState('Droitier')
  const [selStyles, setSelStyles] = useState(['Attaquant'])
  const [selLevel, setSelLevel] = useState(0)
  const [selSource, setSelSource] = useState('')
  const [selGoals, setSelGoals] = useState(['Être classé'])

  const toggleStyle = (s:string) => setSelStyles(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])
  const toggleGoal = (g:string) => setSelGoals(p=>p.includes(g)?p.filter(x=>x!==g):[...p,g])

  const Btn: React.CSSProperties = { width:'100%', height:48, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:'auto', fontFamily:'Inter,sans-serif' }

  if (step===0) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between', minHeight:'100vh', padding:'80px 24px 48px' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:28, marginTop:40 }}>
        <div style={{ width:80, height:80, borderRadius:'50%', border:'1.5px solid var(--green-dark)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--green-dark)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🏓</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:34, fontWeight:700, color:'var(--text)', letterSpacing:3 }}>PING PANG</div>
          <div style={{ fontSize:11, color:'var(--green)', letterSpacing:'2.5px', marginTop:6 }}>PLAY · RANK · CONNECT</div>
        </div>
      </div>
      <div style={{ width:'100%' }}>
        <p style={{ textAlign:'center', fontSize:10, color:'var(--text4)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:16 }}>REJOINS LA COMMUNAUTÉ</p>
        <button style={{ ...Btn, background:'var(--text)', color:'var(--bg)', marginBottom:10 }} onClick={()=>setStep(1)}>Continuer avec Apple</button>
        <button style={{ ...Btn, background:'var(--bg2)', border:'0.5px solid var(--border)' }} onClick={()=>setStep(1)}>Continuer avec Google</button>
        <p style={{ textAlign:'center', fontSize:10, color:'var(--text4)', marginTop:16 }}>En continuant, tu acceptes nos conditions d'utilisation</p>
      </div>
    </div>
  )

  const pad: React.CSSProperties = { padding:'56px 24px 32px', display:'flex', flexDirection:'column', minHeight:'100vh' }

  if (step===1) return (
    <div style={pad}>
      <ProgressBar step={1} total={4} />
      <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Étape 1 / 4</p>
      <p style={{ fontSize:26, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Ton profil joueur</p>
      <p style={{ fontSize:13, color:'var(--text3)', marginBottom:28 }}>Quelques infos pour personnaliser ton expérience.</p>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        <div>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Prénom</p>
          <input style={{ width:'100%', height:44, borderRadius:10, padding:'0 14px', background:'var(--bg2)', border:'0.5px solid var(--border)', color:'var(--text3)', fontSize:13, fontFamily:'Inter,sans-serif', outline:'none' }} placeholder="Ex : Lucas" />
        </div>
        <div>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Ville</p>
          <input style={{ width:'100%', height:44, borderRadius:10, padding:'0 14px', background:'var(--bg2)', border:'0.5px solid var(--border)', color:'var(--text3)', fontSize:13, fontFamily:'Inter,sans-serif', outline:'none' }} placeholder="Ex : Paris" />
        </div>
        <div>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Main directrice</p>
          <div style={{ display:'flex', gap:8 }}>
            {['Droitier','Gaucher'].map(h=>(
              <button key={h} onClick={()=>setHand(h)} style={{ flex:1, height:40, borderRadius:10, background:hand===h?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${hand===h?'var(--border-green)':'var(--border)'}`, color:hand===h?'var(--text)':'var(--text2)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>{h}</button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Style de jeu</p>
          <div>{styles.map(s=>(<span key={s} onClick={()=>toggleStyle(s)} style={{ display:'inline-flex', alignItems:'center', padding:'6px 14px', borderRadius:20, fontSize:12, cursor:'pointer', marginRight:6, marginBottom:6, background:selStyles.includes(s)?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${selStyles.includes(s)?'var(--border-green)':'var(--border)'}`, color:selStyles.includes(s)?'var(--text)':'var(--text3)' }}>{s}</span>))}</div>
        </div>
      </div>
      <button style={Btn} onClick={()=>setStep(2)}>CONTINUER <ArrowRight size={16}/></button>
    </div>
  )

  if (step===2) return (
    <div style={pad}>
      <ProgressBar step={2} total={4} />
      <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Étape 2 / 4</p>
      <p style={{ fontSize:26, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Ton niveau actuel</p>
      <p style={{ fontSize:13, color:'var(--text3)', marginBottom:28 }}>Ça calibre ton ELO de départ.</p>
      <div style={{ flex:1 }}>
        {levels.map((l,i)=>(
          <div key={l.label} onClick={()=>setSelLevel(i)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:52, borderRadius:10, padding:'0 14px', marginBottom:8, cursor:'pointer', background:selLevel===i?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${selLevel===i?'var(--border-green)':'var(--border)'}` }}>
            <div><p style={{ fontSize:13, fontWeight:500, color:selLevel===i?'var(--text)':'var(--text2)' }}>{l.label}</p><p style={{ fontSize:11, color:'var(--text3)' }}>{l.sub}</p></div>
            <p style={{ fontSize:12, fontWeight:600, color:selLevel===i?'var(--green)':'var(--text4)' }}>ELO {l.elo.toLocaleString('fr-FR')}</p>
          </div>
        ))}
        <div style={{ borderRadius:12, padding:'12px 14px', marginTop:16, background:'var(--green-deep)', border:'0.5px solid var(--border-green)' }}>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)' }}>ELO DE DÉPART ESTIMÉ</p>
          <p style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginTop:4 }}>{levels[selLevel].elo.toLocaleString('fr-FR')}</p>
        </div>
      </div>
      <button style={Btn} onClick={()=>setStep(3)}>CONTINUER <ArrowRight size={16}/></button>
    </div>
  )

  if (step===3) return (
    <div style={pad}>
      <ProgressBar step={3} total={4} />
      <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Étape 3 / 4</p>
      <p style={{ fontSize:26, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Comment tu nous as trouvés ?</p>
      <p style={{ fontSize:13, color:'var(--text3)', marginBottom:28 }}>Aide-nous à comprendre d'où vient notre communauté.</p>
      <div style={{ flex:1 }}>
        {sources.map(s=>(
          <div key={s} onClick={()=>setSelSource(s)} style={{ height:40, borderRadius:10, padding:'0 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', background:selSource===s?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${selSource===s?'var(--border-green)':'var(--border)'}` }}>
            <p style={{ fontSize:13, fontWeight:500, color:selSource===s?'var(--text)':'var(--text2)' }}>{s}</p>
          </div>
        ))}
      </div>
      <button style={Btn} onClick={()=>setStep(4)}>CONTINUER <ArrowRight size={16}/></button>
    </div>
  )

  return (
    <div style={pad}>
      <ProgressBar step={4} total={4} />
      <p style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Étape 4 / 4</p>
      <p style={{ fontSize:26, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Ce que tu cherches ici</p>
      <p style={{ fontSize:13, color:'var(--text3)', marginBottom:28 }}>Choisis tout ce qui te correspond.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, flex:1 }}>
        {goals.map(g=>(
          <div key={g} onClick={()=>toggleGoal(g)} style={{ borderRadius:12, cursor:'pointer', display:'flex', alignItems:'flex-end', padding:12, height:64, fontSize:12, background:selGoals.includes(g)?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${selGoals.includes(g)?'var(--border-green)':'var(--border)'}`, color:selGoals.includes(g)?'var(--text)':'var(--text2)', fontWeight:selGoals.includes(g)?600:400, fontFamily:'Inter,sans-serif' }}>{g}</div>
        ))}
      </div>
      <button style={Btn} onClick={()=>router.push('/feed')}>C'EST PARTI <ArrowRight size={16}/></button>
    </div>
  )
}
