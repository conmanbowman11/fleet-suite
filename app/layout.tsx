import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  title: "Fleet Suite",
  description: "Equipment service logs and parts orders for farms",
  // Lets the app open full-screen when added to an iPhone home screen
  appleWebApp: { capable: true, title: "Fleet Suite", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2E4034",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
