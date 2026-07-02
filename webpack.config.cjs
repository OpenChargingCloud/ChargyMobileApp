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
            __CHARGY_CORE_SHA512__:  JSON.stringify(coreSHA512)
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]
};
