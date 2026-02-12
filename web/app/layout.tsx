import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Centimail",
  description: "Gmail classifier / unread brief",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
