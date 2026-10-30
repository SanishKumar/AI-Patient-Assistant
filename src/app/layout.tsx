import type { Metadata } from 'next'
import '@fontsource-variable/manrope'
import '@fontsource-variable/outfit'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aether Health — Your connected health story',
  description:
    'Your personal health record workspace. Organize lab reports, keep a journal, follow original sources, and prepare for your next visit.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
