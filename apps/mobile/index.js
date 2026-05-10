import 'react-native-gesture-handler';
import { createElement } from 'react';
import { ExpoRoot } from 'expo-router';
import { registerRootComponent } from 'expo';

const ctx = require.context('./app');

function App() {
  return createElement(ExpoRoot, { context: ctx });
}

registerRootComponent(App);
