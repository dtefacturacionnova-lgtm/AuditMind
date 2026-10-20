# Documentos DTE de ejemplo (V1 y V2.0)

Copiados de `dtes-y-analítica-sv/tests/fixtures/` (`v1/` y `v2/`). Son documentos **sintéticos**: el emisor y el receptor son «NOMBRE DE PRUEBA»,
los NIT y NRC son ceros y el ambiente es el de pruebas. No contienen datos de ninguna persona ni empresa.

- `v1/`: normativa anterior (`identificacion.version` 1 para FE, CR, CL, DCL, FEX, FSE y CD; 3 para CCF, NR, NC y ND).
- `v2/`: normativa V2.0 de mayo de 2026 (2, 4, 4, 4, 4, 2, 2, 2, 3, 2 y 2, respectivamente).

Dos ejemplos V2 (`07-comprobante-retencion` y `09-dcl`) no coinciden con el esquema oficial en el nombre de algunos campos
(`numeroDocumento` en vez de `numDocumento`; `codEstable`/`codPuntoVenta` en vez de `codigo`/`puntoVenta`): el validador los reporta
como error estructural, y las pruebas lo dan por sabido.

Para correr las pruebas, desde `apps/ai-service`: `venv/Scripts/python.exe -m unittest discover -s tests -t . -v`
