import type { CapacitorConfig } from '@capacitor/cli';

// The iPad app runs as a real installed app rather than a Safari tab. The web
// code is unchanged - this only wraps it.
//
// One consequence worth knowing: bundled this way the app loads from
// capacitor://localhost, so it no longer knows which machine served it. The
// laptop is reached by its Bonjour name instead (see src/poco/serverUrl.ts),
// which needs the local-network permission and the ATS exception in
// ios/App/App/Info.plist. Both are set there, with comments.
const config: CapacitorConfig = {
  appId: 'com.poco.ipad', // placeholder - change to the team's own before shipping
  appName: 'Poco',
  webDir: 'dist',
  ios: {
    // The app draws its own layout and expects the whole screen; inset, the
    // 1180x820 landscape design no longer fits.
    contentInset: 'never',
    // Poco is tapped, not scrolled. Rubber-banding on a fixed layout only
    // looks broken.
    scrollEnabled: false,
    backgroundColor: '#FDFBF7',
  },
};

export default config;
