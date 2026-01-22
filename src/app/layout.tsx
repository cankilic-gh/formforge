import type { Metadata } from 'next';
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
