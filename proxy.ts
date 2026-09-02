import { NextResponse, type NextRequest } from 'next/server'

// Le contrôle réel du cookie signé se fait côté serveur dans app/admin/layout.tsx
// (le proxy n'a pas accès à node:crypto). Ici : redirection rapide si aucun cookie.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!req.cookies.get('admin_session')?.value) {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*'] }
