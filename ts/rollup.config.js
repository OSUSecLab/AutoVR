// import nodeResolve from "@rollup/plugin-node-resolve";
// import commonjs from "@rollup/plugin-commonjs";
// import dts from 'dts-bundle-generator';

// export default {
//   input: "dist/autovr/index.js",
//   output: {
//     file: 'dist/index.js',
//     format: 'cjs'
//   },
//   plugins: [
//     commonjs(), // <-- this handles some parsing of js syntax or something (necessary for `export { init } from "mathjax";`)
//     nodeResolve(), // <-- this allows npm modules to be added to bundle
//     dts.generateDtsBundle([{ filePath: './dist/autovr/index.d.ts' }])
//   ]
// };

import dts from "rollup-plugin-dts";

const config = [
  {
    input: "dist/autovr/index.js",
    output: {
      file: 'dist/index.js',
      format: 'es'
    }
  },
  {
    input: "dist/autovr/index.d.ts",
    output: [{ file: "./dist/index.d.ts", format: "es" }],
    plugins: [dts()],
  }
];

export default config;
