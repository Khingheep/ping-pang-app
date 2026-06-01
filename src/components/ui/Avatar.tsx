type AvatarColor = 'green' | 'orange' | 'purple' | 'blue' | 'red'
const colors: Record<AvatarColor, { bg: string; border: string; text: string }> = {
  green:  { bg: '#0d2d1e', border: '#1a7a55', text: '#4aaa7a' },
  orange: { bg: '#2e2005', border: '#d0901c', text: '#d0901c' },
  purple: { bg: '#1a0d2e', border: '#573877', text: '#8a6aaa' },
  blue:   { bg: '#0d1a2e', border: '#1a4a7a', text: '#4a7aaa' },
  red:    { bg: '#2e0e0e', border: '#7a1a1a', text: '#dd4a4a' },
}
interface AvatarProps {
  initials: string
  size?: number
  color?: AvatarColor
  fontSize?: number
}
export default function Avatar({ initials, size = 36, color = 'green', fontSize }: AvatarProps) {
  const c = colors[color]
  const fs = fontSize ?? Math.round(size * 0.38)
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: c.bg, border: `1px solid ${c.border}`, color: c.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: fs, flexShrink: 0, fontFamily: 'Inter, sans-serif' }}>
      {initials}
    </div>
  )
}
