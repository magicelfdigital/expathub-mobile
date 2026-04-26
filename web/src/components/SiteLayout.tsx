import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-16 pt-6 sm:pt-10">{children}</main>
      <Footer />
    </div>
  );
}
