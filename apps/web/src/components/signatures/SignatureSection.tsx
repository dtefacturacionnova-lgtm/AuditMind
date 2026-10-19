'use client';

import { useState } from 'react';
import { useSignatureRequests } from '@/hooks/useSignatureRequests';
import { isActive } from '@/lib/signature/internal';
import { SendForSignatureModal, type SendForSignatureModalProps } from './SendForSignatureModal';
import { SignatureRequestsPanel, type SignatureRequestsPanelProps } from './SignatureRequestsPanel';

type SectionProps =
  Pick<SignatureRequestsPanelProps, 'documentType' | 'title' | 'sendLabel' | 'sendDisabledReason' | 'canManage' | 'isManager' | 'renderResponse' | 'responseLabels' | 'emptyHint'> &
  Pick<SendForSignatureModalProps, 'documentLabel' | 'documentTitle' | 'defaultSigner' | 'initialPayload' | 'renderPayloadFields' | 'validatePayload' | 'onSent'> &
  {
    targetId: string;
    /** `false` oculta el botón de envío (p. ej. la carta ya se firmó). Por defecto se muestra. */
    canSend?: boolean;
  };

/**
 * Panel de solicitudes + botón y ventana de envío, ya conectados. Cada documento (carta, confirmación, acta) monta
 * solo este componente y aporta lo suyo: su id, su etiqueta y, si hace falta, los campos propios del tipo.
 */
export function SignatureSection(props: SectionProps) {
  const [sending, setSending] = useState(false);
  const { data } = useSignatureRequests(props.documentType, props.targetId);
  const replacesActive = !!data?.some((r) => isActive(r.status));

  return (
    <>
      <SignatureRequestsPanel
        documentType={props.documentType} targetId={props.targetId} title={props.title}
        onSend={props.canSend === false ? undefined : () => setSending(true)} sendLabel={props.sendLabel} sendDisabledReason={props.sendDisabledReason}
        canManage={props.canManage} isManager={props.isManager} renderResponse={props.renderResponse}
        responseLabels={props.responseLabels} emptyHint={props.emptyHint}
      />
      <SendForSignatureModal
        open={sending} onClose={() => setSending(false)}
        documentType={props.documentType} targetId={props.targetId} documentLabel={props.documentLabel} documentTitle={props.documentTitle}
        defaultSigner={props.defaultSigner} replacesActive={replacesActive} initialPayload={props.initialPayload}
        renderPayloadFields={props.renderPayloadFields} validatePayload={props.validatePayload} onSent={props.onSent}
      />
    </>
  );
}
