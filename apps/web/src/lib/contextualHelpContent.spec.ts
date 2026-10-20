import { INTERVIEW_HELP_KEY, SIGNATURE_HELP, resolveHelp } from './contextualHelpContent';

const text = (path: string, code?: string | null) => {
  const t = resolveHelp(path, code);
  return `${t.title}\n${t.body.join('\n')}`;
};

describe('ayuda de la firma electrónica por enlace', () => {
  it('la ficha de un cliente explica la carta de compromiso y conserva la ayuda de Cartera', () => {
    const t = text('/dashboard/portfolio/clients/abc-123');
    expect(t).toMatch(/carta de compromiso/i);
    expect(t).toMatch(/Enviar para firma/);
    expect(t).toMatch(/Registrar firma manual/);
    expect(t).toMatch(/Pipeline: Prospecto/);          // lo que ya decía Cartera sigue ahí
  });

  it('el listado de clientes y el resto de Cartera siguen con la ayuda general de Cartera', () => {
    for (const p of ['/dashboard/portfolio', '/dashboard/portfolio/clients']) {
      expect(resolveHelp(p).title).toBe('Cartera (CRM de Auditoría Externa)');
    }
    expect(resolveHelp('/dashboard/portfolio/profitability').title).toBe('Rentabilidad por Encargo');
    expect(resolveHelp('/dashboard/portfolio/capacity').title).toBe('Capacidad y Calendario (Cartera)');
  });

  it('las confirmaciones explican el envío, el confirmante registrado y la carta de autorización', () => {
    for (const p of ['/dashboard/confirmations', '/dashboard/confirmations/xyz']) {
      const t = text(p);
      expect(t).toMatch(/NIA 505/);
      expect(t).toMatch(/confirmante registrado/);
      expect(t).toMatch(/carta de autorización/);
      expect(t).toMatch(/Con saldo en blanco/);
    }
  });

  it('un papel de entrevista muestra la ayuda del acta firmada, y la ruta de papeles sigue igual sin código', () => {
    const t = text('/dashboard/working-papers/p1', INTERVIEW_HELP_KEY);
    expect(t).toMatch(/Actas para firma/);
    expect(t).toMatch(/Firma presencial/);
    expect(t).toMatch(/modo investigación/);
    expect(resolveHelp('/dashboard/working-papers/p1').title).toBe('Papeles de Trabajo');
  });

  it('la ayuda de los demás papeles no cambió', () => {
    expect(resolveHelp('/dashboard/working-papers/p1', 'PT-NIA530').title).toBe('Muestreo Estadístico (NIA 530)');
    expect(resolveHelp('/dashboard/working-papers/p1', 'PT-FIN-ENCARGO').title).toBe('Carta de Encargo (NIA 210)');
  });

  it('el contenido general de la firma cubre lo que pedía el diseño: qué es, qué evidencia guarda, cómo se verifica y que no es certificada', () => {
    const t = SIGNATURE_HELP.body.join('\n');
    expect(t).toMatch(/código de 6 dígitos/);
    expect(t).toMatch(/huella \(SHA-256\)/);
    expect(t).toMatch(/\/verificar/);
    expect(t).toMatch(/No es una firma certificada/);
    expect(t).toMatch(/una sola vez/);
    expect(t).toMatch(/congelado/);
  });

  it('ningún texto de la firma queda vacío ni demasiado largo para el recuadro de ayuda', () => {
    const topics = [
      SIGNATURE_HELP,
      resolveHelp('/dashboard/portfolio/clients/x'),
      resolveHelp('/dashboard/confirmations'),
      resolveHelp('/dashboard/working-papers/p', INTERVIEW_HELP_KEY),
    ];
    for (const t of topics) {
      expect(t.title.trim()).not.toBe('');
      for (const line of t.body) {
        expect(line.trim()).not.toBe('');
        expect(line.length).toBeLessThan(420);
      }
    }
  });
});
