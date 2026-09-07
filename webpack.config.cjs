const path    = require('path');
const webpack = require('webpack');
const MinimizerPlugin = require('minimizer-webpack-plugin');
const packageJson     = require('./package.json');
const packageLock     = require('./package-lock.json');

const corePackage     = packageLock.packages?.['node_modules/@open-charging-cloud/chargy-core'];
const coreIntegrity   = corePackage?.integrity ?? '';
const coreSHA512      = coreIntegrity.startsWith('sha512-')
    ? Buffer.from(coreIntegrity.substring('sha512-'.length), 'base64').toString('hex')
    : '';
const npmPackageVersions = Object.fromEntries(
    Object.entries(packageLock.packages ?? {})
        .filter(([packagePath, metadata]) => packagePath.startsWith('node_modules/') && metadata?.version)
        .map(([packagePath, metadata]) => [packagePath.substring('node_modules/'.length), metadata.version])
);

/**
 * The compile-time switches of a build.
 *
 * A live link document comes from outside and may name any URL at all, so the
 * application refuses plaintext transports (http://, ws://) and hosts on the
 * local network. A test bench needs those refusals lifted - but that decision
 * belongs to whoever builds the application, never to the document, and never
 * to a runtime setting a user could be talked into flipping.
 *
 * There are three kinds of build, and only one of them is relaxed: an ordinary
 * development build is exactly as strict as a production one - the rules follow
 * the switch, not the mode. What NODE_ENV=production adds is that it refuses to
 * take the switch at all: what is shipped can never speak plaintext, whatever
 * asks.
 *
 * A test bench build asks in either of these forms (the environment variables
 * also reach the Cordova prepare hook, which widens the CSP to match):
 *
 *     CHARGY_ALLOW_INSECURE_TRANSPORTS=1 npm run bundle
 *     npm run bundle -- --env insecureTransports --env privateNetworkTransports
 */
// webpack hands --env values only to a config that is a function; this one is
// an object, so they are read off the command line directly.
const envArguments = process.argv.filter((argument, index) => process.argv[index - 1] === '--env');

const insecureTransportsRequested       = process.env.CHARGY_ALLOW_INSECURE_TRANSPORTS        === '1' ||
                                          envArguments.includes('insecureTransports');
const privateNetworkTransportsRequested = process.env.CHARGY_ALLOW_PRIVATE_NETWORK_TRANSPORTS === '1' ||
                                          envArguments.includes('privateNetworkTransports');

const isProductionBuild                 = process.env.NODE_ENV === 'production';

const allowInsecureTransports           = !isProductionBuild && insecureTransportsRequested;
const allowPrivateNetworkTransports     = !isProductionBuild && privateNetworkTransportsRequested;

for (const [ name, requested, allowed ] of [
    [ 'insecureTransports',       insecureTransportsRequested,       allowInsecureTransports       ],
    [ 'privateNetworkTransports', privateNetworkTransportsRequested, allowPrivateNetworkTransports ]
]) {
    if (allowed)
        console.warn(`\n  !!  ${name}: this build weakens a transport rule. Do not deploy it.  !!\n`);
    else if (requested)
        console.warn(`\n  !!  ${name} ignored: a production build never allows this.  !!\n`);
}

module.exports = {
    mode:    'development',
    target:  'web',
    entry:   path.resolve(__dirname, '.build/js/index.js'),
    devtool: 'source-map',
    ignoreWarnings: [
        warning =>
            warning.module?.resource?.includes(`${path.sep}node_modules${path.sep}file-type${path.sep}source${path.sep}index.js`) &&
            warning.message.includes('Critical dependency: the request of a dependency is an expression')
    ],
    resolve: {
        conditionNames: ['browser', 'import', 'module', 'default'],
        fallback: {
            buffer:      require.resolve('buffer/'),
            'node:buffer': require.resolve('buffer/')
        }
    },
    optimization: {
        minimize: true,
        minimizer: [
            new MinimizerPlugin({
                // Terser 5.50 mangles PDF.js 6.2 private fields inconsistently
                // inside its dynamic WASM imports, which makes the worker invalid.
                exclude: /pdf[_-]worker/i,
                minimizerOptions: {
                    format: {
                        ascii_only: true
                    }
                }
            })
        ]
    },
    output: {
        path:          path.resolve(__dirname, 'www/js'),
        filename:      'bundle.js',
        chunkFilename: '[name].bundle.js',
        charset:       false,
        clean:         true
    },
    plugins: [
        new webpack.DefinePlugin({
            __APP_PACKAGE__:       JSON.stringify(packageJson),
            __NPM_PACKAGE_VERSIONS__: JSON.stringify(npmPackageVersions),
            __CHARGY_CORE_VERSION__: JSON.stringify(corePackage?.version ?? ''),
            __CHARGY_CORE_SHA512__:  JSON.stringify(coreSHA512),
            __CHARGY_ALLOW_INSECURE_TRANSPORTS__:        JSON.stringify(allowInsecureTransports),
            __CHARGY_ALLOW_PRIVATE_NETWORK_TRANSPORTS__: JSON.stringify(allowPrivateNetworkTransports)
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]
};
