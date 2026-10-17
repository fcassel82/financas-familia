import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { SCRIPT_TEMA } from "@/lib/tema";

// Figtree: boa leitura em tela pequena, zero sem barra e algarismos de largura
// igual (tabular-nums) para os valores ficarem alinhados
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finanças da Família",
  description: "Gestão financeira familiar",
};

// Cor da barra do navegador no iPhone acompanha o fundo de cada tema
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1923" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-tema é trocado pelo SCRIPT_TEMA antes da hidratação, daí o suppressHydrationWarning
    <html
      lang="pt-BR"
      data-tema="sistema"
      className={`${figtree.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
