import Link from 'next/link';

/** Lo que se ve cuando no se pudo leer el catálogo (el API caído o lento) o cuando todavía no hay planes que mostrar. Nunca un error técnico. */
export function PricingUnavailable({ reason, contactHref }: { reason: 'error' | 'empty'; contactHref: string | null }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-balance text-2xl font-bold text-slate-900">
        {reason === 'error' ? 'No pudimos cargar los planes en este momento' : 'Estamos preparando los planes'}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        {reason === 'error'
          ? 'Intenta de nuevo en unos minutos. Si ya eres cliente, puedes entrar a tu cuenta con normalidad.'
          : 'Muy pronto publicaremos aquí los planes y sus precios.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/login" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Iniciar sesión
        </Link>
        {contactHref && (
          <a href={contactHref} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Escríbenos
          </a>
        )}
      </div>
    </section>
  );
}
