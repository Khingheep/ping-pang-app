'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
const NavBar = dynamic(() => import('@/components/ui/NavBar'), { ssr: false })
import Link from 'next/link'
import { ArrowLeft, Search, MapPin } from 'lucide-react'

export default function DefiPage() {
  const [type, setType] = useState('Classé')
  const [format, setFormat] = useState('Bo3')
  const [elo, setElo] = useState('Tous niveaux')

  const Chip = ({label,active,onClick}:{label:string;active:boolean;onClick:()=>void}) => (
    <button onClick={onClick} style={{ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:active?600:500, cursor:'pointer', fontFamily:'Inter,sans-serif', background:active?'var(--green-deep)':'var(--bg2)', border:`0.5px solid ${active?'var(--border-green)':'var(--border)'}`, color:active?'var(--text)':'var(--text3)', marginRight:6, marginBottom:6 }}>{label}</button>
  )

  return (
    <div style={{ background:'var(--bg)', minHeight:'100vh', paddingBottom:100 }}>
      <div style={{ padding:'16px 20px 0', display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <Link href="/jouer"><ArrowLeft size={20} color="var(--text3)" /></Link>
        <p style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Créer un défi</p>
      </div>
      <div style={{ padding:'0 20px' }}>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Adversaire</p>
        <div style={{ background:'var(--bg2)', borderRadius:10, padding:'10px 14px', marginBottom:16, border:'0.5px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--green-deep)', border:'1px solid var(--border-green)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>SK</div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Seb Khoury</p>
            <p style={{ fontSize:11, color:'var(--text3)' }}>ELO 1 642</p>
          </div>
          <p style={{ fontSize:12, color:'var(--green)' }}>Changer →</p>
        </div>

        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Type</p>
        <div style={{ marginBottom:16 }}>{['Classé','Amical'].map(t=><Chip key={t} label={t} active={type===t} onClick={()=>setType(t)}/>)}</div>

        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Format</p>
        <div style={{ marginBottom:16 }}>{['Bo3','Bo5','Bo7'].map(f=><Chip key={f} label={f} active={format===f} onClick={()=>setFormat(f)}/>)}</div>

        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Lieu</p>
        <input style={{ width:'100%', height:44, borderRadius:10, padding:'0 14px', background:'var(--bg2)', border:'0.5px solid var(--border)', color:'var(--text)', fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', marginBottom:16 }} defaultValue="Club PPP Oberkampf" />

        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Date et Heure</p>
        <input type="datetime-local" style={{ width:'100%', height:44, borderRadius:10, padding:'0 14px', background:'var(--bg2)', border:'0.5px solid var(--border)', color:'var(--text)', fontSize:13, fontFamily:'Inter,sans-serif', outline:'none', marginBottom:16 }} />

        <p style={{ fontSize:10, fontWeight:600, letterSpacing:'0.8px', textTransform:'uppercase', color:'var(--green)', marginBottom:8 }}>Conditions ELO</p>
        <div style={{ marginBottom:24 }}>{['Tous niveaux','± 200 ELO','± 100 ELO'].map(e=><Chip key={e} label={e} active={elo===e} onClick={()=>setElo(e)}/>)}</div>

        <button style={{ width:'100%', height:48, borderRadius:12, background:'var(--green-dark)', color:'var(--text)', border:'none', fontWeight:600, fontSize:13, letterSpacing:'1px', textTransform:'uppercase', cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
          ENVOYER LE DÉFI
        </button>
      </div>
      <NavBar />
    </div>
  )
}
