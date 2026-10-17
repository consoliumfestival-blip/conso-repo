const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Disable NativeWind for web builds to avoid Metro bundler hanging
if (process.env.EXPO_WEB_SERVER) {
  module.exports = config;
} else {
  module.exports = withNativeWind(config, { input: './src/global.css' });
}