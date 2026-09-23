import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";
import DialogProvider from "../components/dialog";
import EmulatorBadge from "../components/emulator-badge";
import NameGateProvider from "../components/name-gate";
import Pwa from "../components/pwa";
import ThemeColor from "../components/theme-color";
import { KipProvider } from "../utils/store";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "kip",
  description: "Share a spare room or your whole place with friends, for free.",
  // Safari reads none of the manifest for Add to Home Screen; it wants these.
  appleWebApp: { capable: true, title: "kip", statusBarStyle: "default" },
  // Setting `icons` at all stops Next adding app/icon.svg on its own, so it is
  // named here too.
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`,
    apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/apple-touch-icon.png`,
  },
};

// The first paint only, and keyed on the SYSTEM preference because static HTML
// has nothing else to key on — `ThemeColor` corrects both to the theme actually
// resolved as soon as it runs. Values are `--color-bg` from globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#161009" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      {/* crossOrigin must match the SDK's CORS fetch or the preconnected
          socket isn't reused; photos are plain <img>, so none. */}
      <head>
        <link
          rel="preconnect"
          href="https://firestore.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://identitytoolkit.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://securetoken.googleapis.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DialogProvider>
            {/* Inside KipProvider: it reads the profile to know whether a name
                is needed at all. It gates ITSELF to the app's own routes —
                `/portal/` and `/continue/` carry their own sheets, and its
                auto-open would stack a second, undismissable one over them. */}
            <KipProvider>
              <NameGateProvider>{children}</NameGateProvider>
              <EmulatorBadge />
              <Pwa />
              <ThemeColor />
            </KipProvider>
          </DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
