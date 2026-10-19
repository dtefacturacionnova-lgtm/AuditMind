// Jest para la lógica pura de la web (funciones y máquinas de estado): archivos *.spec.ts dentro de src.
module.exports = {
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  transform: {
    '^.+\.ts$': ['ts-jest', {
      diagnostics: false,
      tsconfig: { module: 'commonjs', moduleResolution: 'node', target: 'ES2020', esModuleInterop: true, strict: true, skipLibCheck: true, lib: ['dom', 'esnext'] },
    }],
  },
  testEnvironment: 'node',
  clearMocks: true,
};
