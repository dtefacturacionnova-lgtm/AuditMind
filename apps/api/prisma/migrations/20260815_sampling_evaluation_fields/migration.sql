-- Nuevos valores de "FieldType" para la evaluación de resultados de muestreo (NIA 530):
-- SAMPLE_ITEM_REGISTER (PT-NIA530 S5 — ítems examinados con valor en libros/auditado y tainting %)
-- SAMPLING_EVALUATION (PT-NIA530 S4 — panel calculado: MLE/Precisión Básica/UEL + semáforo)
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'SAMPLE_ITEM_REGISTER';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'SAMPLING_EVALUATION';
