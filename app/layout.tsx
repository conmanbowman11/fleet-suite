import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fleet Suite",
  description: "Equipment service logs and parts ordering for farms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
