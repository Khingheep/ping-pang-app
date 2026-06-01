import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ping Pang App',
  description: 'Play · Rank · Connect',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ background: '#0a0a0a', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 390, minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
