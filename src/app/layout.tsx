import type { Metadata } from "next";
import { Geist_Mono, VT323 } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vt323 = VT323({
  weight: "400",
  variable: "--font-vt323",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Claude Microcomputer Emulator",
  description: "Browser-based terminal-style emulator for early microcomputers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} ${vt323.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
