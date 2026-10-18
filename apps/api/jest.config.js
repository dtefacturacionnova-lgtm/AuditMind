// Jest para la API (apps/api). Las pruebas viven junto al código, en archivos *.spec.ts dentro de src.
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  clearMocks: true,
};
