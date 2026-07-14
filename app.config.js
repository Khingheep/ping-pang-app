/**
 * Config Expo dynamique. Base = app.json (prod : bundle `paris.pingpang.app`).
 *
 * APP_VARIANT=beta -> build de TEST neutre (bundle `com.wbz.rcbeta`, nom « RC Beta »),
 * pour tester sur un compte Apple sans « bruler » le bundle id de prod (qui pourra etre
 * enregistre plus tard sur un autre compte, sans conflit ni transfert).
 *
 *   eas build --platform ios --profile beta        # utilise APP_VARIANT=beta (cf. eas.json)
 *   npm run deploy:web                              # prod, variant absent -> app.json inchange
 */
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT === 'beta') {
    config.name = 'RC Beta';
    config.slug = 'ping-pang-paris'; // le slug/projet EAS reste le meme
    config.ios = { ...config.ios, bundleIdentifier: 'com.wbz.rcbeta' };
    config.android = { ...config.android, package: 'com.wbz.rcbeta' };
  }
  return config;
};
