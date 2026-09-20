const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const browser = env.browser || 'chrome';
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      background: "./src/background/index.ts",
      popup: "./src/popup/popup.ts",
      options: "./src/options/options.ts",
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, `dist/${browser}`),
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: false,
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: "src/popup/popup.html",
            to: "popup.html",
          },
          {
            from: "src/options/options.html",
            to: "options.html",
          },
          {
            from: `manifest-${browser}.json`,
            to: "manifest.json",
          },
          {
            from: "icon.png",
            to: "icon.png",
          },
        ],
      }),
    ],
    target: "web",
    devtool: isProduction ? false : "source-map",
    optimization: {
      minimize: isProduction,
      concatenateModules: false,
    },
  };
};
