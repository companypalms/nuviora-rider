// Metro con Uniwind (Tailwind 4 para React Native), que es lo que usa HeroUI Native para sus estilos.
// withUniwindConfig tiene que ser el último envoltorio.
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
