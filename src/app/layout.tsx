import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPT Market",
  description: "Stash e mercado local para SPT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
