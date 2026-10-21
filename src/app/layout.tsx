import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeInitializationScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: "Go Go Gas!",
  description: "Find nearby gas stations with live prices and optimized routing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
