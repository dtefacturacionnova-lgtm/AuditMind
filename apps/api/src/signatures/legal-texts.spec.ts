import { CONSENT_VERSION, PRIVACY_VERSION, renderConsentText, renderDeclineNotice, renderPrivacyNotice } from './legal-texts';
import { getClientInfo } from './request-info.util';

describe('textos legales', () => {
  it('el consentimiento incluye el título del documento y no deja marcadores sin llenar', () => {
    const t = renderConsentText('Carta de compromiso 2026');
    expect(t).toContain('«Carta de compromiso 2026»');
    expect(t).not.toMatch(/\{[^}]+\}/);
    expect(t).toContain('SHA-256');
  });

  it('el aviso de privacidad y de rechazo nombran a la organización', () => {
    expect(renderPrivacyNotice('Pérez Cortez y Asociados')).toContain('Pérez Cortez y Asociados');
    expect(renderPrivacyNotice('X')).not.toMatch(/\{[^}]+\}/);
    expect(renderDeclineNotice('Org SA')).toContain('Org SA');
  });

  it('los valores se insertan tal cual, como texto (el escapado lo hace quien los muestre)', () => {
    expect(renderConsentText('<b>x</b>')).toContain('«<b>x</b>»');
    expect(renderConsentText('$&')).toContain('«$&»'); // sin interpretar patrones especiales de replace
  });

  it('las versiones están definidas', () => {
    expect(CONSENT_VERSION).toBe('v1');
    expect(PRIVACY_VERSION).toBe('v1');
  });
});

describe('getClientInfo', () => {
  it('toma la IP de req.ip y quita el prefijo IPv4-mapeado', () => {
    expect(getClientInfo({ ip: '::ffff:203.0.113.7', headers: {} }).ip).toBe('203.0.113.7');
    expect(getClientInfo({ ip: '203.0.113.7', headers: {} }).ip).toBe('203.0.113.7');
    expect(getClientInfo({ ip: '2001:db8::1', headers: {} }).ip).toBe('2001:db8::1');
  });

  it('IP ausente → null', () => {
    expect(getClientInfo({ headers: {} }).ip).toBeNull();
    expect(getClientInfo({ ip: '', headers: {} }).ip).toBeNull();
  });

  it('el navegador se trunca a 500 caracteres y se limpian saltos de línea', () => {
    const ua = getClientInfo({ ip: '1.1.1.1', headers: { 'user-agent': 'A'.repeat(900) } }).userAgent!;
    expect(ua).toHaveLength(500);
    expect(getClientInfo({ headers: { 'user-agent': 'a\r\nb\0c' } }).userAgent).toBe('a  b c');
  });

  it('cabecera ausente o no textual → null', () => {
    expect(getClientInfo({ headers: {} }).userAgent).toBeNull();
    expect(getClientInfo({ headers: { 'user-agent': ['x'] } }).userAgent).toBeNull();
  });
});
