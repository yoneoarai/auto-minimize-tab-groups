// webpack.config.js
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const browser = env.browser || 'chrome';
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      background: "./src/common/background.ts",
      popup: "./src/common/popup.ts",
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
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { 
            from: "src/common/popup.html", 
            to: "popup.html" 
          },
          { 
            from: `manifest-${browser}.json`, 
            to: "manifest.json" 
          },
          { 
            from: "icon.png", 
            to: "icon.png" 
          }
        ],
      }),
    ],
    target: "web",
    // Avoid eval() for browser extension security requirements
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
    },
    mode: isProduction ? 'production' : 'development',
  };
};
