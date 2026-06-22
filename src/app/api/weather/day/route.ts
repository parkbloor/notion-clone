import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')?.trim()
  const date = searchParams.get('date')?.trim()

  if (!city || !date) {
    return NextResponse.json({ weather: null })
  }

  try {
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
    geoUrl.searchParams.set('name', city)
    geoUrl.searchParams.set('count', '1')
    geoUrl.searchParams.set('language', 'ko')
    geoUrl.searchParams.set('format', 'json')

    const geoRes = await fetch(geoUrl, { cache: 'no-store' })
    if (!geoRes.ok) return NextResponse.json({ weather: null })

    const geoData = await geoRes.json()
    const first = geoData.results?.[0]
    if (!first) return NextResponse.json({ weather: null })

    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
    weatherUrl.searchParams.set('latitude', String(first.latitude))
    weatherUrl.searchParams.set('longitude', String(first.longitude))
    weatherUrl.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min')
    weatherUrl.searchParams.set('timezone', 'auto')
    weatherUrl.searchParams.set('forecast_days', '16')

    const weatherRes = await fetch(weatherUrl, { cache: 'no-store' })
    if (!weatherRes.ok) return NextResponse.json({ weather: null })

    const weatherData = await weatherRes.json()
    const idx = (weatherData.daily?.time as string[] | undefined)?.indexOf(date) ?? -1
    if (idx === -1) return NextResponse.json({ weather: null })

    return NextResponse.json({
      weather: {
        weathercode: weatherData.daily.weathercode[idx],
        tempMin: weatherData.daily.temperature_2m_min[idx],
        tempMax: weatherData.daily.temperature_2m_max[idx],
      },
    })
  } catch {
    return NextResponse.json({ weather: null })
  }
}
