import PointerAura from "@/components/pointer-aura";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col [min-height:100dvh]">
      <a
        href="#main"
        className="skip-link fixed left-4 top-4 z-[100] rounded-full bg-btn px-5 py-2.5 text-sm font-semibold text-white shadow-lifted"
      >
        跳到正文
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <PointerAura />
    </div>
  );
}
