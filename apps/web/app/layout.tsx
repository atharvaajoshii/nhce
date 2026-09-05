import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import ParticleDrift from "@/components/ui/particle-drift";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import FloatingMessages from "@/components/navigation/FloatingMessages";
import NotificationToastBridge from "@/components/notifications/NotificationToastBridge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "W3HIRE | Decentralized Web3 Talent & Escrow Protocol",
  description:
    "Next-generation Web3 freelance marketplace with smart contract escrows, instant settlements, and decentralized reputation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('w3hire_theme') === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.dataset.theme = 'light';
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.dataset.theme = 'dark';
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased min-h-screen relative selection:bg-moss selection:text-background">
        <AuthProvider>
          <ToastProvider>
            {/* Universal Persistent Canvas Layer - Visible on ALL pages */}
            <div className="fixed inset-0 w-full h-full -z-10 pointer-events-none">
              <ParticleDrift mode="auto" />
            </div>

            {/* Dynamic App Route Pages with transparent background */}
            <div className="relative z-10 flex flex-col min-h-screen bg-transparent">
              {children}
            </div>

            {/* Portal-wide floating messaging widget */}
            <FloatingMessages />

            {/* Realtime message / notification -> popup toast bridge (renders nothing itself) */}
            <NotificationToastBridge />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}