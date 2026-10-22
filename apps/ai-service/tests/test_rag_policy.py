"""Política de embeddings del RAG (2026-10-22): Jina primero, umbral propio de Jina, título delante de cada fragmento y búsqueda que solo
usa los proveedores que tienen fragmentos en el alcance (sin pedirle nada a Gemini cuando ya no hay fragmentos suyos)."""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import embedding_router as er
from app.services import rag_pipeline as rp
from app.services.embedding_router import EmbeddingProvider as P


class Cascada(unittest.TestCase):
    def test_jina_primero_y_gemini_ultimo_recurso(self):
        self.assertEqual(er.PROVIDER_CASCADE, [P.JINA, P.VOYAGE, P.COHERE, P.GEMINI])

    def _embedders(self, fallan=()):
        llamados = []

        def hacer(p):
            def f(texts):
                llamados.append(p)
                if p in fallan:
                    raise RuntimeError(f"{p.value} sin cuota")
                return [[0.1, 0.2] for _ in texts]
            return f

        return llamados, {p: hacer(p) for p in P}

    def test_usa_jina_y_no_toca_a_los_demas(self):
        llamados, fakes = self._embedders()
        with patch.object(er, "_EMBEDDERS", fakes), patch.object(er, "_is_configured", return_value=True):
            _, provider = er.embed_batch_with_fallback(["a", "b"])
        self.assertEqual((provider, llamados), (P.JINA, [P.JINA]))

    def test_si_jina_falla_cae_al_siguiente_y_gemini_es_el_ultimo(self):
        llamados, fakes = self._embedders(fallan={P.JINA, P.VOYAGE, P.COHERE})
        with patch.object(er, "_EMBEDDERS", fakes), patch.object(er, "_is_configured", return_value=True):
            _, provider = er.embed_batch_with_fallback(["a"])
        self.assertEqual((provider, llamados), (P.GEMINI, [P.JINA, P.VOYAGE, P.COHERE, P.GEMINI]))


class JinaConsultaYPasaje(unittest.TestCase):
    """Jina vectoriza distinto la pregunta (retrieval.query) y el fragmento (retrieval.passage)."""

    def _respuesta(self, enviados):
        def post(url, headers=None, json=None, timeout=None):
            enviados.append(json)
            r = MagicMock()
            r.raise_for_status = MagicMock()
            r.json = MagicMock(return_value={"data": [{"index": i, "embedding": [0.5]} for i, _ in enumerate(json["input"])]})
            return r

        return post

    def test_la_pregunta_del_usuario_se_vectoriza_como_consulta(self):
        enviados = []
        with patch.object(er.httpx, "post", self._respuesta(enviados)):
            vec = er.embed_query_with_provider("¿cuándo vence el plazo?", P.JINA)
        self.assertEqual(vec, [0.5])
        self.assertEqual([e["task"] for e in enviados], ["retrieval.query"])

    def test_los_fragmentos_se_siguen_vectorizando_como_pasaje(self):
        enviados = []
        with patch.object(er.httpx, "post", self._respuesta(enviados)):
            er._EMBEDDERS[P.JINA](["fragmento uno", "fragmento dos"])
        self.assertEqual({e["task"] for e in enviados}, {"retrieval.passage"})

    def test_los_otros_proveedores_no_cambian_al_buscar(self):
        llamados = []

        def fake(texts):
            llamados.append(texts)
            return [[0.1]]

        with patch.object(er, "_EMBEDDERS", {**er._EMBEDDERS, P.VOYAGE: fake}):
            er.embed_query_with_provider("hola", P.VOYAGE)
        self.assertEqual(llamados, [["hola"]])


class Umbral(unittest.TestCase):
    def test_jina_usa_el_suyo_y_no_el_de_gemini(self):
        self.assertEqual(er.effective_threshold(P.JINA, 0.65), 0.48)

    def test_un_umbral_mas_bajo_que_el_de_jina_se_respeta(self):
        self.assertEqual(er.effective_threshold(P.JINA, 0.40), 0.40)

    def test_gemini_y_los_demas_no_cambian(self):
        for p in (P.GEMINI, P.VOYAGE, P.COHERE):
            self.assertEqual(er.effective_threshold(p, 0.65), 0.65)


class TituloEnElVectorizado(unittest.TestCase):
    def test_se_quitan_los_avisos_de_vigencia_del_final(self):
        t = rp.titulo_para_embedding(
            "Sentencia de la Sala de lo Contencioso Administrativo — Juicio 303-M-2004 (29-may-2006) — Respaldo de gastos para "
            "profesionales liberales — jurisprudencia histórica, verificar vigencia de la norma aplicada")
        self.assertEqual(t, "Sentencia de la Sala de lo Contencioso Administrativo — Juicio 303-M-2004 (29-may-2006) — Respaldo de gastos para profesionales liberales")

    def test_cada_aviso_conocido(self):
        base = "Documento X — tema Y"
        for aviso in ("interpretación histórica, verificar vigencia del artículo referenciado", "guía histórica, verificar vigencia contra la ley",
                      "la lista cambia cada año y cada guía sustituye a la anterior", "verificar vigencia", "acto administrativo de 2021, verificar si hubo actos posteriores"):
            self.assertEqual(rp.titulo_para_embedding(f"{base} — {aviso}"), base, aviso)

    def test_lo_que_no_es_aviso_se_conserva(self):
        t = "Guía DGII — para el ejercicio fiscal 2026 (septiembre de 2025)"
        self.assertEqual(rp.titulo_para_embedding(t), t)

    def test_sin_guion_largo_queda_igual_y_los_vacios_no_rompen(self):
        self.assertEqual(rp.titulo_para_embedding("NACOT 2018"), "NACOT 2018")
        self.assertEqual(rp.titulo_para_embedding(""), "")
        self.assertEqual(rp.titulo_para_embedding(None), "")

    def test_nunca_deja_el_titulo_vacio_por_quitar_avisos(self):
        self.assertEqual(rp.titulo_para_embedding("verificar vigencia"), "verificar vigencia")

    def test_se_acota_el_largo(self):
        self.assertLessEqual(len(rp.titulo_para_embedding("A" * 1000)), 320)

    def test_el_texto_vectorizado_lleva_el_titulo_delante(self):
        self.assertEqual(rp.texto_para_embedding("Ley X — tema", "Art. 1 ..."), "Ley X — tema\n\nArt. 1 ...")
        self.assertEqual(rp.texto_para_embedding("", "Art. 1 ..."), "Art. 1 ...")


class FakeConn:
    """Base de datos simulada: dice qué proveedores hay en el alcance y qué devuelve la búsqueda de cada uno."""

    def __init__(self, proveedores, resultados):
        self.proveedores, self.resultados, self.busquedas = proveedores, resultados, []

    async def fetch(self, sql, *params):
        if "SELECT DISTINCT kc.embedding_provider" in sql:
            return [{"embedding_provider": p} for p in self.proveedores]
        proveedor = params[-1]
        self.busquedas.append({"proveedor": proveedor, "umbral": params[1], "columna": "embedding_fallback" if "embedding_fallback" in sql.split("ORDER BY")[0] else "embedding"})
        return [{"content": c, "section_title": None, "rag_base": "FISCAL_SV", "doc_title": t, "similarity": s} for c, t, s in self.resultados.get(proveedor, [])]

    async def close(self):
        pass


class Busqueda(unittest.TestCase):
    def correr(self, conn, embed, **kw):
        consultas = []

        def fake_embed(query, provider):
            consultas.append(provider)
            return embed(provider)

        with patch.object(rp.asyncpg, "connect", AsyncMock(return_value=conn)), patch.object(rp, "embed_query_with_provider", fake_embed):
            out = asyncio.run(rp.search_knowledge("¿qué dice la ley?", rag_base="FISCAL_SV", top_k=kw.pop("top_k", 5), threshold=kw.pop("threshold", 0.65)))
        return out, consultas

    def test_solo_jina_en_el_alcance_no_le_pide_nada_a_gemini(self):
        conn = FakeConn(["jina"], {"jina": [("a", "Doc A", 0.60)]})
        out, consultas = self.correr(conn, lambda p: [0.0])
        self.assertEqual(consultas, [P.JINA])
        self.assertEqual([r["doc_title"] for r in out], ["Doc A"])

    def test_la_busqueda_de_jina_usa_su_umbral_y_su_columna(self):
        conn = FakeConn(["jina"], {"jina": []})
        self.correr(conn, lambda p: [0.0], threshold=0.65)
        self.assertEqual(conn.busquedas, [{"proveedor": "jina", "umbral": 0.48, "columna": "embedding_fallback"}])

    def test_con_fragmentos_de_gemini_y_de_jina_busca_en_los_dos_y_ordena(self):
        conn = FakeConn(["gemini", "jina"], {"gemini": [("g", "Doc G", 0.80)], "jina": [("j", "Doc J", 0.70), ("j2", "Doc J2", 0.50)]})
        out, consultas = self.correr(conn, lambda p: [0.0], top_k=2)
        self.assertEqual(sorted(p.value for p in consultas), ["gemini", "jina"])
        self.assertEqual([r["doc_title"] for r in out], ["Doc G", "Doc J"])
        gem = next(b for b in conn.busquedas if b["proveedor"] == "gemini")
        self.assertEqual((gem["umbral"], gem["columna"]), (0.65, "embedding"))

    def test_si_gemini_falla_por_cuota_igual_devuelve_lo_de_jina(self):
        def embed(p):
            if p == P.GEMINI:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return [0.0]

        conn = FakeConn(["gemini", "jina"], {"jina": [("j", "Doc J", 0.7)]})
        out, _ = self.correr(conn, embed)
        self.assertEqual([r["doc_title"] for r in out], ["Doc J"])

    def test_sin_fragmentos_en_el_alcance_no_hay_resultados_ni_llamadas(self):
        out, consultas = self.correr(FakeConn([], {}), lambda p: [0.0])
        self.assertEqual((out, consultas), ([], []))

    def test_un_proveedor_desconocido_se_ignora(self):
        conn = FakeConn(["nuevo", "jina"], {"jina": [("j", "Doc J", 0.7)]})
        out, consultas = self.correr(conn, lambda p: [0.0])
        self.assertEqual(consultas, [P.JINA])
        self.assertEqual(len(out), 1)

    def test_consulta_vacia(self):
        self.assertEqual(asyncio.run(rp.search_knowledge("   ")), [])


class IngestaConTitulo(unittest.TestCase):
    def test_se_vectoriza_el_titulo_con_el_fragmento_pero_se_guarda_el_fragmento_solo(self):
        conn = MagicMock()
        conn.execute = AsyncMock()
        conn.close = AsyncMock()
        conn.fetchval = AsyncMock(return_value="Sentencia 303-M-2004 — Respaldo de gastos — jurisprudencia histórica, verificar vigencia")
        capturado = {}

        def fake_embed(textos):
            capturado["textos"] = list(textos)
            return [[0.1] for _ in textos], P.JINA

        insertar = AsyncMock(return_value=2)
        with patch.object(rp.asyncpg, "connect", AsyncMock(return_value=conn)), patch.object(rp, "embed_batch_with_fallback", fake_embed), \
                patch.object(rp, "_insert_chunks", insertar), patch.object(rp, "_chunk_text", return_value=["fragmento uno", "fragmento dos"]):
            asyncio.run(rp.run_ingestion("doc1", "texto", "FISCAL_SV", None))
        self.assertEqual(capturado["textos"], ["Sentencia 303-M-2004 — Respaldo de gastos\n\nfragmento uno", "Sentencia 303-M-2004 — Respaldo de gastos\n\nfragmento dos"])
        self.assertEqual(insertar.call_args.args[4], ["fragmento uno", "fragmento dos"])   # en la base queda el fragmento, sin el título

    def test_si_se_pasa_el_titulo_no_se_consulta(self):
        conn = MagicMock()
        conn.execute = AsyncMock()
        conn.close = AsyncMock()
        conn.fetchval = AsyncMock()
        with patch.object(rp.asyncpg, "connect", AsyncMock(return_value=conn)), patch.object(rp, "embed_batch_with_fallback", lambda t: ([[0.1]], P.JINA)), \
                patch.object(rp, "_insert_chunks", AsyncMock(return_value=1)), patch.object(rp, "_chunk_text", return_value=["x"]):
            asyncio.run(rp.run_ingestion("doc1", "texto", "FISCAL_SV", None, doc_title="Título dado"))
        conn.fetchval.assert_not_called()


if __name__ == "__main__":
    unittest.main()
