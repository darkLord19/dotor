import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dotor - Privacy-First Personal Assistant',
  description: 'Search your emails, calendar, and messages without storing any data',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="app-wrapper">{children}</div>
      </body>
    </html>
  );
}
