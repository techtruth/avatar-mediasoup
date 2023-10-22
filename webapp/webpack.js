const webpack = require("webpack");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const LocalizeAssetPlugin = require("webpack-localize-assets-plugin");
const StatoscopeWebpackPlugin = require("@statoscope/webpack-plugin").default;
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const LocaleBootstrap = require("./plugins/localePlugin.js");
const argv = require("minimist")(process.argv.slice(2));
const credentials = require("./credentials.json");
const package = require("../package.json");

const config = {
  context: __dirname,
  mode: argv.mode === "production" ? "production" : "development",
  bail: true,
  devtool: false,

  //Single entrypoint, with multiple files
  entry: {
    core: ["./core/index.js"],
    mainline: ["./mainline/index.js"],
  },

  //Where built files will be sent to. Match the webserver static directory here.
  output: {
    path: path.resolve(__dirname, "dist"),
    publicPath: "/", //TODO: Or CDN path in production
    filename:
      argv.mode === "production"
        ? "js/locale/[locale]/[chunkhash].js"
        : "js/locale/[locale]/[name].js",
    sourceMapFilename: "js/locale/[locale]/[name].js.map[query]",
    chunkFilename:
      argv.mode === "production"
        ? "js/locale/[locale]/bundle.[chunkhash].js"
        : "js/locale/[locale]/bundle.[name].js",
    assetModuleFilename: "assets/[name]-[contenthash][ext]",
    hashFunction: "xxhash64",
  },

  optimization:
    argv.mode === "production"
      ? {
          minimize: true,
          runtimeChunk: "single",
          splitChunks: {
            chunks: "all",
            maxInitialRequests: 30,
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                chunks: "all",
              },
            },
          },
        }
      : {
          runtimeChunk: "single",
        },

  //Handle things outside of webpack base functionality
  plugins: [
    new HtmlWebpackPlugin({
      title:
        argv.mode === "production"
          ? "WebRTC Application Interface"
          : process.env.npm_package_version,
      filename: "index.html",
      scriptLoading: "defer",
      favicon: branding.favIcon,
      meta: {
        "application-name": branding.name,
        "theme-color": "#000000",
        description: branding.description,
        robots: "index,follow",
        "og:title":
          argv.mode === "production"
            ? "WebRTC Application Interface"
            : process.env.npm_package_version,
        "og:site_name": "WebRTC Application Interface",
        "og:type": "website",
        "og:description": "Application description",
        "og:image": "/assets/media-image.png",
        "twitter:card": "summary_large_image",
        "twitter:image:alt": "Short Application description",
        viewport: "width=device-width,initial-scale=1.0",
      },
    }),
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        diagnosticOptions: {
          semantic: true,
          syntactic: true,
        },
      },
    }),
    new LocalizeAssetPlugin({
      locales: { en: "webapp/stage/locales/en.json",
                 "en-US": "webapp/stage/locales/en.json",
                 ko: "webapp/stage/locales/ko.json",
                 "ko-KR": "webapp/stage/locales/ko.json" },
      functionName: "localize",
      throwOnMissing: false,
      warnOnUnusedString: false,
      hmrLocale: "en",
    }),
    new LocaleBootstrap(),
    new MiniCssExtractPlugin({ filename: "[name]-[contenthash].css" }),
    new StatoscopeWebpackPlugin()),
    new webpack.SourceMapDevToolPlugin({
      noSources: !argv.sourcemaps,
      filename: "[file].map",
    })
  ],

  module: {
    rules: [
      {
        test: /\.js$|\.ts$/,
        include: [
          path.resolve(__dirname, "core"),
        ],
        use: ["babel-loader"],
      },
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.png$|\.jpg$|\.env$|\.svg$|\.ktx2$|\.webp$/,
        type: "asset",
      },
      {
        test: /\.npy$|\.ttf$|\.woff2$|\.woff$|\.eot$|\.mp3$|\.mp4$|\.m4a$|\.bin$|\.navmesh$/,
        type: "asset/resource",
      },
    ],
  },

  resolve: {
    extensions: [".js", ".ts", ".json"],
    alias: {
      "@core": path.join(__dirname, "core"),
      "@stage": path.join(__dirname, "stage"),
      "@workers": path.join(__dirname, "workers"),
    },

    fallback: {
      https: false,
      stream: false,
      zlib: false,
      crypto: false,
      http: false,
      buffer: false,
      assert: false,
      fs: false,
      net: false,
      tls: false,
      inherits: false,
      path: false,
      console: false,
      process: false,
      util: false,
      url: false,
    },
  },
};

if (argv.build === "diag") {
  config.entry = ["./core/index.js", "./diag/index.ts"];
}

if (argv.build === "quick") {
  config.entry = ["./core/index.js", "./quick/index.ts"];
}

if (!argv.watch) {
  console.log("Compiling webpack");
  webpack(config, (err, stats) => {
    if (err) {
      console.error("Webpack Error:");
      console.log(err);
      throw new Error("Webpack build failed");
    }
    if (stats.hasErrors() || stats.hasWarnings()) {
      console.log(stats.toString({ colors: true }));
      return;
    }
    console.log(
      stats.toString({
        colors: true,
        warnings: true,
        assets: true,
        moduleAssets: true,
        groupAssetsByChunk: false,
        groupAssetsByEmitStatus: false,
        groupAssetsByInfo: false,
        orphanModules: true,
        modules: true,
        groupModulesByAttributes: false,
        dependentModules: true,
        entrypoints: true,
        chunks: false,
        chunkGroups: false,
        chunkModules: false,
        chunkOrigins: false,
        chunkRelations: false,
        env: true,
        performance: true,
      })
    );
  });
} else {
  console.log("Watching build folder");
  webpack(config).watch(
    {
      aggregateTimeout: 500,
      poll: 2000,
      ignored: /node_modules/,
    },
    (err, stats) => {
      if (err) {
        console.error(err);
        return;
      }
      if (stats && stats.hasErrors()) {
        console.error(stats.toString({ colors: true }));
        return;
      }
      console.log(stats.toString({ colors: true }));
    }
  );
}
