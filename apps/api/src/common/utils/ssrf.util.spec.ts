import { ipv6Groups, isPublicHost, isPublicIp } from './ssrf.util';

describe('ipv6Groups', () => {
  it('expande `::`, la IPv4 incrustada y la zona', () => {
    expect(ipv6Groups('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(ipv6Groups('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ipv6Groups('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(ipv6Groups('::ffff:7f00:1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(ipv6Groups('64:ff9b::10.0.0.1')).toEqual([0x64, 0xff9b, 0, 0, 0, 0, 0x0a00, 1]);
    expect(ipv6Groups('1:2:3:4:5:6:1.2.3.4')).toEqual([1, 2, 3, 4, 5, 6, 0x0102, 0x0304]);
    expect(ipv6Groups('fe80::1%eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(ipv6Groups('2606:4700:4700::1111')).toEqual([0x2606, 0x4700, 0x4700, 0, 0, 0, 0, 0x1111]);
  });
  it('rechaza formas inválidas', () => {
    for (const bad of ['1::2::3', '1:2:3:4:5:6:7:8:9', '::ffff:300.1.1.1', 'g::1', '1:2:3:4:5:6:7']) expect(ipv6Groups(bad)).toBeNull();
  });
});

describe('isPublicIp', () => {
  it('IPv4 privadas, loopback, metadatos y reservadas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1', '192.0.2.1']) {
      expect(isPublicIp(ip)).toBe(false);
    }
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('72.61.4.66')).toBe(true);
  });

  it('IPv6 con una IPv4 interna adentro, en cualquier forma de escribirla', () => {
    // La forma hexadecimal es la que deja el analizador de URL: antes pasaba como pública.
    for (const ip of [
      '::ffff:127.0.0.1', '::ffff:7f00:1', '::FFFF:7F00:0001', '0:0:0:0:0:ffff:7f00:1', '::ffff:a9fe:a9fe',
      '::ffff:10.0.0.1', '64:ff9b::127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', '2002:c0a8:101::1',
      '::127.0.0.1', '::7f00:1',
    ]) expect({ ip, publica: isPublicIp(ip) }).toEqual({ ip, publica: false });
    expect(isPublicIp('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicIp('64:ff9b::808:808')).toBe(true);
  });

  it('IPv6 loopback, sin especificar, ULA, link-local, site-local, multicast, Teredo y documentación', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '2001::1', '2001:db8::1', '100::1']) {
      expect({ ip, publica: isPublicIp(ip) }).toEqual({ ip, publica: false });
    }
    expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIp('2001:4860:4860::8888')).toBe(true);
  });

  it('lo que no es IP no es público', () => {
    expect(isPublicIp('localhost')).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });
});

describe('isPublicHost con lo que deja el analizador de URL', () => {
  it('[::ffff:127.0.0.1] llega normalizado a hexadecimal y se rechaza', async () => {
    const host = new URL('http://[::ffff:127.0.0.1]:8003/internal').hostname;
    expect(host).toBe('[::ffff:7f00:1]');
    await expect(isPublicHost(host)).resolves.toBe(false);
  });
  it('IPv4 escrita en decimal u octal llega normalizada y se rechaza', async () => {
    await expect(isPublicHost(new URL('http://2130706433/').hostname)).resolves.toBe(false);
    await expect(isPublicHost(new URL('http://0x7f.1/').hostname)).resolves.toBe(false);
  });
  it('localhost y nombres internos', async () => {
    await expect(isPublicHost('localhost')).resolves.toBe(false);
    await expect(isPublicHost('api.localhost')).resolves.toBe(false);
    await expect(isPublicHost('metadata.google.internal')).resolves.toBe(false);
  });
});
