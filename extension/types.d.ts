// Ambient types for the extension build. esbuild bundles `.css` via its
// `text` loader (see scripts/build-extension.mjs), so a CSS import yields
// the stylesheet as a string.
declare module "*.css" {
  const css: string;
  export default css;
}
