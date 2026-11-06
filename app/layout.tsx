import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Outfit } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = { title: "Argos · Electoral", icons: { icon: "/argos_logo.svg" }, description: "Resultados electorales de México por territorio, año y tipo de elección" };

const temaInit = `try{var t=localStorage.getItem('tema');if(!t)t='light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${jakarta.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: temaInit }} /></head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
