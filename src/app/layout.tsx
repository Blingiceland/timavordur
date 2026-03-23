import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tímavörður | Tímaskráningarkerfi fyrir fyrirtæki",
  description: "Einfalt og öruggt tímaskráningarkerfi. Starfsfólk klukkar inn og út, þú sérð allt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="is">
      <body>{children}</body>
    </html>
  );
}
