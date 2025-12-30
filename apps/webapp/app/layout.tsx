import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './providers/theme-provider';

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
