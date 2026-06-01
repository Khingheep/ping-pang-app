import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const licence = searchParams.get('licence')
  const nom = searchParams.get('nom')

  if (!licence && !nom) {
    return NextResponse.json({ error: 'Paramètre requis' }, { status: 400 })
  }

  let browser = null
  try {
    const { connect } = require('puppeteer-real-browser')
    
    const result = await connect({
      headless: false,
      args: [],
      customConfig: {},
      skipTarget: [],
      fingerprint: true,
      turnstile: true,
      connectOption: {},
    })

    browser = result.browser
    const page = result.page

    await page.goto('https://www2.fftt.com/site/competition/classement/classement-national', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await page.waitForSelector('input[name="licence"]', { timeout: 20000 })

    if (licence) {
      await page.type('input[name="licence"]', licence, { delay: 80 })
    } else {
      await page.type('input[name="nom"]', nom || '', { delay: 80 })
    }

    await new Promise(r => setTimeout(r, 800))
    await page.click('#input-search-small')
    await page.waitForSelector('.player-view', { timeout: 15000 })
    await new Promise(r => setTimeout(r, 1000))

    const joueur = await page.evaluate(() => {
      const row = document.querySelector('.player-view')
      if (!row) return null
      const link = row.querySelector('a[href*="personnes/by-number"]') as HTMLAnchorElement
      const nom = link?.textContent?.trim() || ''
      const idMatch = link?.href?.match(/number_id=(\d+)/)
      const licence = idMatch ? idMatch[1] : ''
      const prenomEl = link?.closest('.col-medium')?.nextElementSibling
      const prenom = prenomEl?.textContent?.trim() || ''
      const boldEls = Array.from(row.querySelectorAll('.txt-bold-blue'))
      const rangNational = boldEls[0]?.textContent?.trim() || ''
      const pointsMensuels = boldEls[1]?.textContent?.trim() || ''
      const pointsOfficiels = boldEls[2]?.textContent?.trim() || ''
      const classEl = Array.from(row.querySelectorAll('.col-small')).find(el =>
        /^[NRP]\d+/.test(el.textContent?.trim() || '')
      )
      const classementOfficiel = classEl?.textContent?.trim() || ''
      const clubLink = row.querySelector('a[href*="structures/by-number"]') as HTMLAnchorElement
      const club = clubLink?.textContent?.trim() || ''
      const catEls = Array.from(row.querySelectorAll('.col-small'))
      const categorie = catEls.find(el =>
        /^[A-Z]\d?$/.test(el.textContent?.trim() || '')
      )?.textContent?.trim() || ''
      return { licence, nom, prenom, rangNational, pointsMensuels, classementOfficiel, pointsOfficiels, club, categorie }
    })

    if (!joueur) return NextResponse.json({ error: 'Joueur non trouvé' }, { status: 404 })
    return NextResponse.json({ joueur })

  } catch (error: any) {
    console.error('Puppeteer error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 502 })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}