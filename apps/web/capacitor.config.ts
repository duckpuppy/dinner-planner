import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.duckpuppy.dinnerplanner',
  appName: 'Dinner Planner',
  webDir: 'dist',
  server: {
    // In production, use the bundled web app (not a live URL)
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
