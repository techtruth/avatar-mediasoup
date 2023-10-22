const HtmlWebpackPlugin = require("safe-require")("html-webpack-plugin");

class LocaleBootstrap {
  apply(compiler) {
    compiler.hooks.compilation.tap("LocaleBootstrap", (compilation) => {
      //See if this action is neccessary
      if (!HtmlWebpackPlugin) {
        console.log(
          "HTML Webpack Plugin not found. Will not modify build pipeline."
        );
        return;
      }

      //Intercept localized assets and remove them from the asset queue.
      // Construct a new js asset which determines browser locale at runtime
      // and imports the matching locale bundle.
      HtmlWebpackPlugin.getHooks(compilation).beforeAssetTagGeneration.tapAsync(
        "LocaleBootstrap",
        (data, cb) => {
          //Get locale assets
          let localeAssets = data.assets.js.filter((asset) =>
            asset.match("/locale/")
          );

          //Create the locale bootstrap file
          let fileString = `let clientLocale = navigator.language;\n`;
          fileString += `console.debug("Localized to", clientLocale);\n`;
          fileString += `let localeArray = new Array(\n`;
          for (let asset of localeAssets) {
            fileString += `"${asset}",`;
          }
          fileString = fileString.replace(/,$/, ""); //Remove trailing comma
          fileString += `);\n`; //End of array
          fileString += `let hardlocale = new Array(
                           "en",
                           "en-US",
                           "ko",
                           "ko-KR");\n`;
          fileString += `let neededAssets = localeArray.map( asset => {
                           if(hardlocale.some(locale => locale === clientLocale)) {
                             //Use locale if its supported
                             return asset.replace(/%5Blocale%3Ab64b2e3f%5D/, clientLocale)
                           } else {
                             //Use english if not supported
                             return asset.replace(/%5Blocale%3Ab64b2e3f%5D/, "en")
                           }
                         });\n`;

          //Create promise array and resolve all
          fileString += `let assetPromises = new Array();\n`;
          fileString += `neededAssets.forEach( (asset) => {
                              assetPromises.push(
                                import(asset)
                              );
                         })\n`;
          fileString += `Promise.all(assetPromises).then((values) => { console.debug("Localization complete.") })`;

          let filename = "/js/localebootstrap." + Date.now() + ".js";

          compilation.emitAsset(
            filename,
            new compiler.webpack.sources.RawSource(fileString, false)
          );

          //Remove the localeAssets from tags to include in html
          // (because they will be loaded from locale bootstrap file)
          data.assets.js = data.assets.js.filter(
            (asset) => !asset.match("/locale/")
          );

          //Add the created asset to the files
          data.assets.js.push(filename);

          // Tell webpack to move on
          cb(null, data);
        }
      );
    });
  }
}

module.exports = LocaleBootstrap;
