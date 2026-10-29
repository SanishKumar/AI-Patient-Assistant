import type { Metadata } from 'next'
import '@fontsource-variable/manrope'
import '@fontsource-variable/outfit'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aether Health — Your connected health story',
  description:
    'An evidence-linked health record workspace. Explore a synthetic health timeline, compare source records, and prepare for a visit.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
