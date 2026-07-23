import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: {
      default: settings.siteTitle,
      template: `%s · ${settings.siteName}`,
    },
    description: settings.siteDescription,
  };
}

// 让 iPhone 刘海屏、全面屏 Android 和横屏设备使用真实视口宽度渲染。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="tutorial-site-theme";var root=document.documentElement;function theme(){try{return localStorage.getItem(k)==="dark"?"dark":"light"}catch(e){return"light"}}function sync(t,persist){root.dataset.theme=t;root.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"#0d1117":"#f7f8fa");if(persist){try{localStorage.setItem(k,t)}catch(e){}}}sync(theme(),false);document.addEventListener("click",function(e){var el=e.target instanceof Element?e.target.closest("[data-theme-toggle]"):null;if(!el)return;sync(root.dataset.theme==="dark"?"light":"dark",true)});window.addEventListener("storage",function(e){if(e.key===k)sync(e.newValue==="dark"?"dark":"light",false)})})()`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
