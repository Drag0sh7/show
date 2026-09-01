import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://drag0sh7.github.io/show/'),
  title: 'roomtime.',
  description: 'pick a time. book it.',
  openGraph: {
    title: 'roomtime.',
    description: 'pick a time. book it.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'roomtime.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'roomtime.',
    description: 'pick a time. book it.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased`}>{children}</body>
    </html>
  );
}
