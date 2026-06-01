'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

type Format = 'Tableau'|'Poules + Tableau'|'Round Robin'
type Players = 8|16|32|64
type PoolSize = 3|4|5|'auto'

function generatePools(players: string[], poolSize: number): string[][] {
  const pools: string[][] = []
  for (let i = 0; i < players.length; i += poolSize) {
    pools.push(players.slice(i, i + poolSize))
  }
  return pools
}

const COLORS = ['#4aaa7a','#d0901c','#8a6aaa','#4a7aaa','#dd4a4a','#4aaa7a','#d0901c','#8a6aaa']

export default function TournoiPage() {
  const [step, setStep] = useState<'form'|'pools'|'bracket'>('form')
  const [name, setName] = useState('PPP Open Été 2025')
  const [lieu, setLieu] = useState('Club PPP Oberkampf')
  const [format, setFormat] = useState<Format>('Poules + Tableau')
  const [maxPlayers, setMaxPlayers] = useState<Players>(16)
  const [poolSize, setPoolSize] = useState<PoolSize>('auto')
  const [visibility, setVisibility] = useState('Public')
  const [eloMin, setEloMin] = useState('Tous niveaux')

  const players = Array.from({length:maxPlayers},(_,i)=>`Joueur ${i+1}`)
  const effectivePoolSize = poolSize==='auto' ? 4 : poolSize
  const pools = generatePools(players, effectivePoolSize)
  const nbPoolWinners = pools.length
  const bracketSize = [2,4,8,16,32].find(n=>n>=nbPoolWinners) || 16

  const Chip = ({ label, active, onClick }: { label:string; active:boolean; onClick:()=>void }) => (
    <button onClick={onClick} style={{ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:active?600:500, cursor:'pointer', fontFamily:'Inter,sans-serif', background:active?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${active?'var(--border-green)':'var(--border)'}`, color:active?'var(--text)':'var(--text3)', marginRight:6, marginBottom:6 }}>{label}</button>
  )
  const Input: React.CSSProperties = { width:'100%', height:44, borderRadius:10, padding:'0 14px', background:'var(--bg2)', border:'0.5px solid var(--border)', color:'var(--text)', fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', marginBottom:16 }
  const Lbl: React.CSSProperties = { fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8, display:'block' }
  const Btn: React.CSSProperties = { width:'100%', height:48, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', fontFamily:'Inter,sans-serif', marginTop:16 }

  if (step==='form') return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0', display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <Link href="/jouer"><ArrowLeft size={20} color="var(--text3)" /></Link>
        <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Créer un tournoi</p>
      </div>
      <div style={{ padding:'0 20px' }}>
        <span style={Lbl}>Nom du tournoi</span>
        <input style={Input} value={name} onChange={e=>setName(e.target.value)} />
        <span style={Lbl}>Lieu</span>
        <input style={Input} value={lieu} onChange={e=>setLieu(e.target.value)} />
        <span style={Lbl}>Date de début</span>
        <input style={Input} type="datetime-local" />

        <span style={Lbl}>Format</span>
        <div style={{ marginBottom:16 }}>
          {(['Tableau','Poules + Tableau','Round Robin'] as Format[]).map(f=>(
            <Chip key={f} label={f} active={format===f} onClick={()=>setFormat(f)} />
          ))}
        </div>

        <span style={Lbl}>Joueurs max</span>
        <div style={{ marginBottom:16 }}>
          {([8,16,32,64] as Players[]).map(n=>(
            <Chip key={n} label={String(n)} active={maxPlayers===n} onClick={()=>setMaxPlayers(n)} />
          ))}
        </div>

        {(format==='Poules + Tableau'||format==='Round Robin') && (
          <>
            <span style={Lbl}>Joueurs par poule</span>
            <div style={{ marginBottom:16 }}>
              {([3,4,5,'auto'] as PoolSize[]).map(n=>(
                <Chip key={n} label={n==='auto'?'Automatique':String(n)} active={poolSize===n} onClick={()=>setPoolSize(n)} />
              ))}
            </div>
          </>
        )}

        <span style={Lbl}>Visibilité</span>
        <div style={{ marginBottom:16 }}>
          {['Public','Sur invitation','Privé'].map(v=>(
            <Chip key={v} label={v} active={visibility===v} onClick={()=>setVisibility(v)} />
          ))}
        </div>

        <span style={Lbl}>Conditions ELO</span>
        <div style={{ marginBottom:16 }}>
          {['Tous niveaux','1000+','1400+'].map(e=>(
            <Chip key={e} label={e} active={eloMin===e} onClick={()=>setEloMin(e)} />
          ))}
        </div>

        <button style={Btn} onClick={()=>setStep(format==='Tableau'?'bracket':'pools')}>
          {format==='Tableau'?'GÉNÉRER LE TABLEAU →':'GÉNÉRER LES POULES →'}
        </button>
      </div>
      <NavBar />
    </div>
  )

  if (step==='pools') return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0', display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <button onClick={()=>setStep('form')} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}><ArrowLeft size={20} color="var(--text3)" /></button>
        <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>{name}</p>
      </div>
      <div style={{ padding:'0 20px' }}>
        <p style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>{pools.length} poules de {effectivePoolSize} joueurs</p>
        {pools.map((pool, pi)=>(
          <div key={pi} style={{ background:'var(--bg2)', borderRadius:14, padding:14, marginBottom:12, border:`0.5px solid ${COLORS[pi % COLORS.length]}33` }}>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:COLORS[pi % COLORS.length], marginBottom:10 }}>Poule {String.fromCharCode(65+pi)}</p>
            {pool.map((player, i)=>(
              <div key={player} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i<pool.length-1?'0.5px solid var(--border)':'none' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:`${COLORS[pi % COLORS.length]}22`, border:`1px solid ${COLORS[pi % COLORS.length]}44`, color:COLORS[pi % COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 }}>{i+1}</div>
                <p style={{ fontSize:13, color:'var(--text2)' }}>{player}</p>
              </div>
            ))}
          </div>
        ))}
        <button style={{ width:'100%', height:48, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', fontFamily:'Inter,sans-serif', marginTop:8 }} onClick={()=>setStep('bracket')}>
          VOIR LE TABLEAU FINAL →
        </button>
      </div>
      <NavBar />
    </div>
  )

  const rounds = Math.log2(bracketSize)
  const roundNames: Record<number,string> = { 1:'Finale', 2:'Demi-finales', 4:'Quarts', 8:'8èmes', 16:'16èmes', 32:'32èmes' }

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0', display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <button onClick={()=>setStep(format==='Tableau'?'form':'pools')} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}><ArrowLeft size={20} color="var(--text3)" /></button>
        <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Tableau</p>
      </div>
      <div style={{ padding:'0 20px' }}>
        <p style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>Tableau à élimination directe · {bracketSize} places</p>
        {Array.from({length:rounds},(_,ri)=>{
          const matchCount = bracketSize / Math.pow(2, ri+1)
          const label = roundNames[matchCount] || `Tour ${ri+1}`
          return (
            <div key={ri} style={{ marginBottom:16 }}>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>{label}</p>
              {Array.from({length:matchCount},(_,mi)=>(
                <div key={mi} style={{ background:'var(--bg2)', borderRadius:10, padding:'10px 14px', marginBottom:6, border:'0.5px solid var(--border)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <p style={{ fontSize:13, color: ri===0?'var(--text2)':'var(--text4)' }}>{ri===0 && format!=='Tableau'?`Vainqueur Poule ${String.fromCharCode(65+mi*2)}`:`Joueur ${mi*2+1}`}</p>
                    <p style={{ fontSize:11, color:'var(--text4)' }}>vs</p>
                    <p style={{ fontSize:13, color: ri===0?'var(--text2)':'var(--text4)' }}>{ri===0 && format!=='Tableau'?`Vainqueur Poule ${String.fromCharCode(65+mi*2+1)}`:`Joueur ${mi*2+2}`}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
        <button style={{ width:'100%', height:48, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
          PUBLIER LE TOURNOI
        </button>
      </div>
      <NavBar />
    </div>
  )
}
