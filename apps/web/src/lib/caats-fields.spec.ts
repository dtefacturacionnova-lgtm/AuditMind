import { FIELD_DEFS, autoMatchColumn, type AnalysisId } from './caats-fields';

// Encabezados de las bases sintéticas de Ejemplosdemo/caats: con ellos el portal debe mapear solo TODOS los campos obligatorios.
const ENCABEZADOS: Partial<Record<AnalysisId, string[]>> = {
  gl: ['fecha', 'hora', 'usuario', 'cuenta', 'descripcion', 'monto'],
  ap: ['numero_factura', 'vendor_id', 'nombre_proveedor', 'fecha_factura', 'fecha_pago', 'monto'],
  payroll: ['id_empleado', 'nombre_empleado', 'departamento', 'cargo', 'salario_bruto', 'salario_neto', 'aprobado_por', 'cuenta_bancaria'],
  sod: ['usuario', 'nombre_completo', 'departamento', 'permiso'],
  vendor_master: ['vendor_id', 'nombre_proveedor', 'nit', 'cuenta_bancaria', 'direccion', 'estado', 'ultima_actividad'],
  related_parties: ['vendor_id', 'nombre_proveedor', 'nit', 'fecha', 'monto'],
  expenses: ['id_empleado', 'nombre_empleado', 'fecha', 'categoria', 'monto', 'aprobado_por'],
  revenue_cutoff: ['numero_factura', 'cliente', 'fecha_factura', 'monto', 'fecha_entrega'],
  bid_rigging: ['licitacion', 'nombre_proveedor', 'monto', 'ganador'],
  ar_aging: ['numero_factura', 'cliente', 'fecha_factura', 'fecha_vencimiento', 'monto', 'nota_credito'],
  fixed_assets: ['id_activo', 'nombre_activo', 'costo', 'fecha_adquisicion', 'vida_util', 'depreciacion_acumulada', 'estado', 'ultima_verificacion'],
  structuring: ['titular', 'fecha', 'monto'],
  missing_trader: ['nombre_proveedor', 'fecha', 'monto', 'nit', 'direccion'],
  tax_haven: ['nombre_proveedor', 'pais', 'fecha', 'monto'],
  sanctions_screening: ['nombre_proveedor', 'nit', 'pais'],
};

describe('autoMatchColumn — nombre del cliente', () => {
  it.each([['cliente'], ['nombre_cliente'], ['Nombre Cliente'], ['customer_name'], ['Customer'], ['Razón Social']])(
    'la columna «%s» se reconoce como nombre de cliente/proveedor', (col) => {
      expect(autoMatchColumn('vendor_name', ['numero_factura', col, 'fecha_factura', 'monto'])).toBe(col);
    });

  it('los encabezados de proveedor siguen mapeándose como antes', () => {
    expect(autoMatchColumn('vendor_name', ['vendor_id', 'nombre_proveedor', 'monto'])).toBe('nombre_proveedor');
    expect(autoMatchColumn('vendor_name', ['proveedor', 'monto'])).toBe('proveedor');
    expect(autoMatchColumn('vendor_name', ['vendor_name', 'monto'])).toBe('vendor_name');
    expect(autoMatchColumn('vendor_id', ['vendor_id', 'nombre_proveedor', 'monto'])).toBe('vendor_id');
  });

  it('una columna sin relación no se mapea sola', () => {
    expect(autoMatchColumn('vendor_name', ['numero_factura', 'fecha_factura', 'monto'])).toBe('');
  });

  it('el titular de la cuenta sigue reconociendo «cliente» (pitufeo)', () => {
    expect(autoMatchColumn('account_holder', ['cliente', 'fecha', 'monto'])).toBe('cliente');
  });
});

describe('mapeo automático de las bases sintéticas', () => {
  it.each(Object.keys(ENCABEZADOS))('%s: todos los campos obligatorios se mapean solos', (motor) => {
    const columnas = ENCABEZADOS[motor as AnalysisId]!;
    const faltan = (FIELD_DEFS[motor as AnalysisId] ?? []).filter((d) => d.required && !autoMatchColumn(d.key, columnas)).map((d) => d.key);
    expect(faltan).toEqual([]);
  });
});
