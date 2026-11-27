import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display, Space_Grotesk } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Fuentes de la identidad Nova Criterio (fase 0 del rediseño): solo se exponen como variables CSS; el cuerpo sigue en Inter como hasta hoy.
// preload:false mientras ninguna pantalla las use (no se descargan hasta que una regla CSS las pida); pasar a true en la fase 1.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-space-grotesk', display: 'swap', preload: false });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains-mono', display: 'swap', preload: false });
const playfair = Playfair_Display({ subsets: ['latin'], style: ['italic'], weight: ['400', '700'], variable: '--font-playfair', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: 'Nova Criterio — Intelligence Platform',
  description: 'Plataforma de auditoría inteligente',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
