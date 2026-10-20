import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { applySeo } from '../seo-browser'

export default function Seo() {
  const { pathname } = useLocation()
  useEffect(() => {
    // The server supplies post metadata; PostDetailPage updates it after client navigation.
    if (!/^\/board\/\d+$/.test(pathname)) applySeo(pathname)
  }, [pathname])
  return null
}
