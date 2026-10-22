"""Re-vectoriza fragmentos del RAG con Jina y con el título del documento delante (política del 2026-10-22).

Por qué: Gemini (cuota diaria de 1000) se agota con cualquier carga grande y, mientras tanto, los fragmentos que indexó no aparecen en
las búsquedas; además los puntajes de dos modelos no se pueden comparar en un mismo ranking. Todo pasa a Jina, y a cada fragmento se le
antepone el título de su documento al vectorizarlo (ver rag_pipeline.texto_para_embedding).

Es seguro y reanudable:
  - de a UN documento por vez, cada uno en su transacción;
  - el texto de los fragmentos no se toca; solo se escriben `embedding_fallback`, `embedding_provider='jina'` y `metadata.emb_v=2`;
  - el vector de Gemini (`embedding`) se CONSERVA hasta que se pida --anular-gemini, para poder comparar y volver atrás;
  - lo ya rehecho (provider jina y emb_v = 2) se salta.

Uso (desde apps/ai-service, con el entorno del servidor):
  python scripts/reembed_chunks.py --env /home/deploy/auditmind/.env --dry-run
  python scripts/reembed_chunks.py --env /home/deploy/auditmind/.env [--base FISCAL_SV ...] [--solo-gemini] [--max-docs N]
  python scripts/reembed_chunks.py --env /home/deploy/auditmind/.env --anular-gemini [--dry-run]
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def cargar_env(ruta: str) -> None:
    """Carga un .env (KEY=VALUE) al entorno ANTES de importar la configuración de la app. No imprime valores."""
    for linea in Path(ruta).read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        k, v = linea.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


PENDIENTE = "(kc.embedding_provider <> 'jina' OR COALESCE(kc.metadata->>'emb_v', '1') <> '2')"


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", help="ruta del .env del servidor")
    ap.add_argument("--base", action="append", help="limitar a una base RAG (se puede repetir)")
    ap.add_argument("--solo-gemini", action="store_true", help="solo los fragmentos que hoy son de Gemini (fase A)")
    ap.add_argument("--max-docs", type=int, default=0, help="procesar como máximo N documentos (0 = todos)")
    ap.add_argument("--dry-run", action="store_true", help="solo contar, no escribir")
    ap.add_argument("--anular-gemini", action="store_true", help="poner en NULL el vector de Gemini de los fragmentos ya migrados")
    args = ap.parse_args()
    if args.env:
        cargar_env(args.env)

    import asyncpg

    from app.config import settings
    from app.services.embedding_router import _embed_jina
    from app.services.rag_pipeline import EMBEDDING_TEXT_VERSION, texto_para_embedding

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        if args.anular_gemini:
            antes = await conn.fetchval("SELECT pg_total_relation_size('rag_chunks')")
            n = await conn.fetchval("SELECT count(*) FROM rag_chunks WHERE embedding_provider <> 'gemini' AND embedding IS NOT NULL")
            print(f"fragmentos con vector de Gemini ya migrados a otro proveedor: {n} | tamaño de rag_chunks: {antes / 1e6:.0f} MB")
            if not args.dry_run:
                r = await conn.execute("UPDATE rag_chunks SET embedding = NULL WHERE embedding_provider <> 'gemini' AND embedding IS NOT NULL")
                despues = await conn.fetchval("SELECT pg_total_relation_size('rag_chunks')")
                print(f"anulados: {r} (el espacio se libera al compactar la tabla; tamaño ahora: {despues / 1e6:.0f} MB)")
            return

        filtros = ["kd.is_active = true", PENDIENTE]
        params: list = []
        if args.solo_gemini:
            filtros.append("kc.embedding_provider = 'gemini'")
        if args.base:
            params.append(args.base)
            filtros.append(f"kc.rag_base = ANY(${len(params)}::text[])")
        donde = " AND ".join(filtros)
        docs = await conn.fetch(
            f"""SELECT kd.id, kd.title, kd.rag_base, count(kc.id)::int n, sum(length(kc.content))::bigint chars
                FROM rag_documents kd JOIN rag_chunks kc ON kc.doc_id = kd.id WHERE {donde}
                GROUP BY kd.id, kd.title, kd.rag_base ORDER BY kd.rag_base, kd.title""", *params)
        total = sum(d["n"] for d in docs)
        tokens = sum(d["chars"] for d in docs) // 3.6
        print(f"pendientes: {len(docs)} documentos, {total} fragmentos (≈ {int(tokens):,} tokens sin contar los títulos)")
        if args.dry_run:
            por_base: dict = {}
            for d in docs:
                por_base.setdefault(d["rag_base"], [0, 0])
                por_base[d["rag_base"]][0] += 1
                por_base[d["rag_base"]][1] += d["n"]
            for b, (nd, nc) in sorted(por_base.items()):
                print(f"  {b:<22} {nd:>4} documentos {nc:>6} fragmentos")
            return

        hechos = fragmentos = fallos_seguidos = 0
        t0 = time.time()
        for i, d in enumerate(docs, 1):
            if args.max_docs and hechos >= args.max_docs:
                break
            rows = await conn.fetch(
                f"SELECT kc.id, kc.content FROM rag_chunks kc WHERE kc.doc_id = $1 AND {PENDIENTE} ORDER BY kc.chunk_index", d["id"])
            try:
                textos = [texto_para_embedding(d["title"], r["content"]) for r in rows]
                vectores = await asyncio.to_thread(_embed_jina, textos)
                if len(vectores) != len(rows):
                    raise RuntimeError(f"Jina devolvió {len(vectores)} vectores para {len(rows)} fragmentos")
                datos = [("[" + ",".join(str(x) for x in v) + "]", r["id"]) for v, r in zip(vectores, rows)]
                async with conn.transaction():
                    await conn.executemany(
                        "UPDATE rag_chunks SET embedding_fallback = $1::vector, embedding_provider = 'jina', "
                        f"metadata = COALESCE(metadata, '{{}}'::jsonb) || '{{\"emb_v\": {EMBEDDING_TEXT_VERSION}}}'::jsonb WHERE id = $2", datos)
                hechos += 1
                fragmentos += len(rows)
                fallos_seguidos = 0
                print(f"{i}/{len(docs)} OK {len(rows):>4} fragmentos | {d['rag_base']} | {d['title'][:70]}", flush=True)
            except Exception as e:  # cuota o red: se sigue con el siguiente; si fallan varios seguidos, se detiene
                fallos_seguidos += 1
                print(f"{i}/{len(docs)} FALLÓ {d['title'][:60]} | {repr(e)[:160]}", flush=True)
                if fallos_seguidos >= 5:
                    print("5 fallos seguidos: se detiene (probable cuota o caída del proveedor). Se puede reanudar.", flush=True)
                    break
            await asyncio.sleep(0.5)
        print(f"TERMINADO documentos={hechos} fragmentos={fragmentos} en {round(time.time() - t0)} s", flush=True)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
