var path = require("path"),
    fs = require("fs"),
    webpack = require("webpack"),
    ExtractTextPlugin = require("extract-text-webpack-plugin"),
    CopyWebpackPlugin = require("copy-webpack-plugin"),
    HtmlWebpackPlugin = require("html-webpack-plugin");

var BUNDLE_NAME = "bundle",
    DEVTOOL = "inline-source-map",
    CONTEXT = __dirname,
    SOURCE_WWW = path.resolve(CONTEXT, "www.src"),
    SOURCE_TYPESCRIPT = path.resolve(SOURCE_WWW, "ts"),
    SOURCE_JAVASCRIPT = path.resolve(SOURCE_WWW, "es"),
    SOURCE_NAME = "index",
    SOURCE_SCSS = path.resolve(SOURCE_WWW, "scss"),
    SOURCE_SCSS_NAME = "styles.scss",
    SOURCE_CSS = path.resolve(SOURCE_WWW, "css"),
    SOURCE_CSS_NAME = "styles.css",
    TARGET_CSS = "css",
    TARGET_JAVASCRIPT = "js",
    TARGET_WWW = path.resolve(CONTEXT, "www"),
    VENDOR_NAME = "vendor";

var usingTypeScript = fs.existsSync(SOURCE_TYPESCRIPT),
    usingScss = fs.existsSync(SOURCE_SCSS);

var SOURCE_ENTRY = path.join(path.basename(usingTypeScript ? SOURCE_TYPESCRIPT : SOURCE_JAVASCRIPT), SOURCE_NAME + (usingTypeScript ? ".ts" : ".js")),
    SOURCE_STYLE = path.join(path.basename(usingScss ? SOURCE_SCSS : SOURCE_CSS), usingScss ? SOURCE_SCSS_NAME : SOURCE_CSS_NAME),
    TARGET_JS_FILE = path.join(TARGET_JAVASCRIPT, BUNDLE_NAME + ".js"),
    TARGET_JS_VENDOR = path.join(TARGET_JAVASCRIPT, VENDOR_NAME + ".js"),
    TARGET_CSS_FILE = path.join(TARGET_CSS, BUNDLE_NAME + ".css"),
    TARGET_CSS_VENDOR = path.join(TARGET_CSS, VENDOR_NAME + ".css");

var extractStylesPlugin = new ExtractTextPlugin(TARGET_CSS_FILE),
    extractStylesVendorPlugin = new ExtractTextPlugin(TARGET_CSS_VENDOR);

var vendor = ["core-js"];

var webpackConfig = {
    context: SOURCE_WWW,
    devtool: DEVTOOL,
    entry: {
        app: [
            "./" + SOURCE_ENTRY,
            "./" + SOURCE_STYLE,

            /* any other entry files */

        ]
    },
    output: {
        filename: TARGET_JS_FILE,
        path: TARGET_WWW
    },
    resolve: {
        extensions: [
            ".js", ".ts", ".jsx", ".es",// typical JS extensions
            ".jsm", ".esm",             // jsm is node's ES6 module ext
            ".json",                    // some modules require json without an extension
            ".css", ".scss",            // CSS & SASS extensions
            "*"                         // allow extensions on imports
        ],
        modules: [
            path.resolve(SOURCE_TYPESCRIPT, "lib"),
            path.resolve(SOURCE_TYPESCRIPT, "vendor"),
            path.resolve(SOURCE_JAVASCRIPT, "lib"),
            path.resolve(SOURCE_JAVASCRIPT, "vendor"),
            path.resolve(SOURCE_WWW, "lib"),
            path.resolve(SOURCE_WWW, "vendor"),
            "node_modules"
        ],
        alias: {
            "$LIB": "lib",
            "Lib": "lib",
            "$VENDOR": "vendor",
            "Vendor": "vendor",

            /* any more aliases you need */

        },
    },
    module: {
        rules: [
            // HTML & TEXT files should just be loaded as raw (included in bundle)
            { test: /\.(html|txt)$/, use: "raw-loader" },

            // Images and web fonts should be copied & file path returned
            {
                test: /\.(png|jpe?g|svg|gif|eot|ttf|woff|woff2)$/,
                use: ["file-loader?name=[path][name].[ext]&emitFile=true"]
            },

            // JSON/JSON5 should use the JSON5 loader and be included in bundle
            { test: /\.(json|json5)$/, use: "json5-loader" },

            // Extract our app's CSS into the bundle
            {
                test: /\.s?css$/,
                exclude: /node_modules\/.*\.css$/,
                use: extractStylesPlugin.extract({
                    fallback: "style-loader",
                    publicPath: "../",
                    use: [
                        { loader: "css-loader?sourceMap=true" },
                        { loader: "resolve-url-loader?sourceMap=true" },
                        { loader: "sass-loader?sourceMap=true" },
                    ]
                })
            },

            // css files in node_modules are put into a vendor bundle
            {
                test: /node_modules\/.*\.css$/,
                use: extractStylesVendorPlugin.extract({
                    fallback: "style-loader",
                    publicPath: "../",
                    use: [
                        { loader: "css-loader?sourceMap=true" },
                        { loader: "resolve-url-loader?sourceMap=true" },
                    ]
                })
            },

            // JavaScript / TypeScript code
            {
                test: /\.((j|t)sx?)$/,
                use: ["ts-loader" + (usingTypeScript ? "" : "?entryFileIsJs")],
                exclude: /node_modules/
            },
        ]
    },
    plugins: [
        new CopyWebpackPlugin([
            { from: "*.*" },
            { from: "img/**/*" },
            { from: "css/**/*" },
            { from: "js/**/*" },
            { from: "vendor/**/*" },
            { from: "lib/**/*" },
            { from: "html/**/*" },
            { from: "webfonts/**/*" },

            /* any other files you need to copy */

        ]),
        extractStylesPlugin,
        extractStylesVendorPlugin,
        new HtmlWebpackPlugin({
            filename: "index.html",
            template: "index.html",
            inject: true,
            chunksSortMode: "dependency"
        }),
    ]
};

if (vendor.length > 0) {
    webpackConfig.entry.vendor = vendor;
    webpackConfig.plugins.push(new webpack.optimize.CommonsChunkPlugin({
        name: "vendor",
        filename: TARGET_JS_VENDOR
    }));
}

module.exports = webpackConfig;