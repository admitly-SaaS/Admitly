import type { Metadata } from "next";
import "./globals.css";

// As fontes do design v3 (Instrument Serif, Libre Caslon Text, Instrument Sans,
// IBM Plex Mono) são carregadas por cada página, junto do CSS dela. O layout não
// baixa mais nada — o create-next-app trazia Geist e Geist Mono, que nenhuma
// tela usava.

export const metadata: Metadata = {
  title: {
    default: "Admitly — o mentor de admissões",
    template: "%s · Admitly",
  },
  description:
    "Seu caminho até uma universidade no exterior: 39 oportunidades verificadas, ordenadas pelo seu perfil, com prazo e checklist por candidatura.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
