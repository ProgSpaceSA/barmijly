import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "برمجلي — نظام إدارة التذاكر",
  description: "نظام داخلي لإدارة طلبات التعديلات والتحديثات البرمجية",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Apply dark class synchronously before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('brm-theme');
              if (!t) { t = 'dark'; localStorage.setItem('brm-theme', 'dark'); }
              if (t === 'dark') document.documentElement.classList.add('dark');
              else document.documentElement.classList.remove('dark');
            } catch(e) { document.documentElement.classList.add('dark'); }
          })();
        `}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
