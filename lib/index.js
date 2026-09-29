/**
 * Package entry (package.json "main").
 *
 * The implementation lives in ./host.js so the file can be replaced — or, as
 * when this plugin was first mounted, imported under a new module identity — to
 * pick up host-side changes, since Node caches ESM modules by URL and the loader
 * row names the file it imports.
 */

export * from './host.js'
