// Stand-in for node-domexception@1.0.0, which npm marks deprecated ("Use your
// platform's native DOMException instead"). It is reached only through
// @google-cloud/storage → gaxios → node-fetch → fetch-blob, which still
// depends on it in every published version, and it exported exactly this on
// Node 17 and later. package.json "overrides" points the dependency here.
module.exports = globalThis.DOMException;
