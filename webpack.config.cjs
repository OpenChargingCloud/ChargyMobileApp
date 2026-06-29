const path    = require('path');
const webpack = require('webpack');
const MinimizerPlugin = require('minimizer-webpack-plugin');

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
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]
};
