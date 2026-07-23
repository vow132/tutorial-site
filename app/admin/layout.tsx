import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "管理后台",
    template: "%s · 管理后台",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen flex-col [min-height:100dvh]">
      {children}
    </main>
  );
}
