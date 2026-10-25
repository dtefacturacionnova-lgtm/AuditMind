'use client';

import { useState, type FormEvent } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { Mail } from 'lucide-react';
import type { CodePurpose } from '@/lib/signature/flow';
import { Alert, Card, Heading, primaryButton, secondaryButton, inputClass } from './ui';

export interface CodeStepProps {
  maskedEmail: string;
  purpose: CodePurpose;
  sent: boolean;
  error: string | null;
  notice: string | null;
  locked: boolean;
  busy: boolean;
  resendAt: number | null;
  onSend: () => void;
  onVerify: (code: string) => void;
}

export function CodeStep({ maskedEmail, purpose, sent, error, notice, locked, busy, resendAt, onSend, onVerify }: CodeStepProps) {
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
          <>Por seguridad, {purpose === 'sign' ? 'antes de mostrarte el documento' : 'antes de entregarte tu copia'} enviamos un código de 6 dígitos a{' '}
            <strong className="text-gray-800">{maskedEmail}</strong>.</>
        }
      >
        {purpose === 'sign' ? 'Verifica tu correo' : 'Verifica tu correo para descargar tu copia'}
      </Heading>

      <div className="space-y-4">
        {notice && <Alert tone="amber">{notice}</Alert>}
        {locked && <Alert tone="red">Se bloqueó la verificación por demasiados intentos. Vuelve a intentarlo en una hora o pide un enlace nuevo a quien te lo envió.</Alert>}

        {!sent ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={onSend} disabled={busy || locked} className={primaryButton}>
              <Mail className="h-4 w-4" aria-hidden="true" /> {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-gray-800">Código de 6 dígitos</label>
              <input
                id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={locked} aria-invalid={error ? true : undefined} aria-describedby={error ? 'otp-error' : 'otp-help'}
                className={`${inputClass} max-w-[14rem] text-center text-2xl font-semibold tracking-[0.5em]`} placeholder="••••••"
              />
              <p id="otp-help" className="mt-1.5 text-xs text-gray-500">Vence en 10 minutos. Si no lo ves, revisa la carpeta de correo no deseado.</p>
            </div>
            {error && <Alert tone="red" id="otp-error">{error}</Alert>}
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
