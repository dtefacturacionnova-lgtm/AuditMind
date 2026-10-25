'use client';

import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';
import { Alert, Card, Heading, inputClass, primaryButton, secondaryButton } from '@/components/signature/ui';

export interface PortalCodeStepProps {
  orgName: string;
  maskedEmail: string;
  sent: boolean;
  error: string | null;
  notice: string | null;
  locked: boolean;
  /** Bloqueo definitivo: el enlace ya no sirve hasta que el equipo auditor genere uno nuevo. */
  permanent: boolean;
  busy: boolean;
  /** Momento (epoch ms) en que se puede pedir otro código. */
  resendAt: number | null;
  onSend: () => void;
  onVerify: (code: string) => void;
}

/**
 * Paso del código por correo del portal PBC (docs/portal-pbc-codigo-por-correo.md §6). El código NO se envía solo al
 * abrir: así el equipo auditor, que abre el enlace para revisarlo, no le manda correos al auditado.
 */
export function PortalCodeStep({ orgName, maskedEmail, sent, error, notice, locked, permanent, busy, resendAt, onSend, onVerify }: PortalCodeStepProps) {
  const [code, setCode] = useState('');
  const seconds = useCountdown(resendAt);
  const canResend = !busy && !locked && seconds === 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && !busy && !locked) onVerify(code);
  };

  return (
    <Card>
      <Heading
        subtitle={
          <>Por seguridad, antes de mostrarte las solicitudes de <strong className="text-gray-800">{orgName}</strong> enviamos un código de 6 dígitos a{' '}
            <strong className="text-gray-800">{maskedEmail}</strong>. Es el correo registrado por el equipo auditor para esta solicitud.</>
        }
      >
        Verifica tu correo
      </Heading>

      <div className="space-y-4">
        {notice && <Alert tone="amber">{notice}</Alert>}
        {locked && (
          <Alert tone="red">
            {permanent
              ? 'Este enlace se bloqueó por demasiados intentos fallidos. Pide al equipo auditor que te envíe uno nuevo.'
              : 'Se bloqueó la verificación por demasiados intentos. Vuelve a intentarlo en una hora o pide un enlace nuevo al equipo auditor.'}
          </Alert>
        )}

        {!sent ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={onSend} disabled={busy || locked} className={primaryButton}>
              <Mail className="h-4 w-4" aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="portal-otp" className="mb-1.5 block text-sm font-medium text-gray-800">Código de 6 dígitos</label>
              <input
                id="portal-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={locked} aria-invalid={error ? true : undefined} aria-describedby={error ? 'portal-otp-error' : 'portal-otp-help'}
                className={`${inputClass} max-w-[14rem] text-center text-2xl font-semibold tracking-[0.5em]`} placeholder="••••••"
              />
              <p id="portal-otp-help" className="mt-1.5 text-xs text-gray-500">Vence en 10 minutos. Si no lo ves, revisa la carpeta de correo no deseado.</p>
            </div>
            {error && <Alert tone="red" id="portal-otp-error">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={code.length !== 6 || busy || locked} className={primaryButton}>
                {busy ? 'Verificando…' : 'Verificar y continuar'}
              </button>
              <button type="button" onClick={() => { setCode(''); onSend(); }} disabled={!canResend} className={secondaryButton}>
                {seconds > 0 ? `Reenviar código en ${seconds} s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        )}

        {!sent && error && <Alert tone="red">{error}</Alert>}
      </div>
    </Card>
  );
}
