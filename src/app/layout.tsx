import type { Metadata } from 'next';
import Script from 'next/script';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'FormForge - Bar Association Form Builder',
  description: 'Create and edit XML forms for Bar Association applications',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
        {/* Google tag (gtag.js) - shared TheGridBase Apps property */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-JXD0CE5REX"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-JXD0CE5REX');`}
        </Script>
      </body>
    </html>
  );
}
