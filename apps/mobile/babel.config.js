module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 / Worklets plugin — must be last.
      'react-native-worklets/plugin',
    ],
  };
};
