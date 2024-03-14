// webpack.config.js
const path = require("path");

module.exports = {
  entry: "./src/background.ts",
  output: {
    filename: "background.js",
    path: path.resolve(__dirname, "dist"),
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
  target: "web",
};
