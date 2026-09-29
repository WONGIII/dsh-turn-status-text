/**
 * dsh-turn-status-text (host half)
 *
 * Owns this plugin's settings namespace, which is what makes the plugin
 * configurable from the GUI: the Web Plugins page lists the namespaces the Host
 * serves, and the browser half registers a card under the same key, so the
 * `可配置` tab pairs the two without knowing what the namespace means.
 *
 * `@deepseek-ai/schemastery` is the schema language every settings section is
 * written in. It is a peer dependency: the harness already ships it, and the
 * browser half needs nothing at all.
 */

import z from '@deepseek-ai/schemastery'

/** Plugin name (diagnostics and loader identity). */
export const name = '@dsh-external/dsh-turn-status-text'

/** Settings namespace this plugin owns; the browser card registers under the same key. */
export const NS = 'turn-status-text'

/** Field inside the namespace holding the custom turn-status text. */
export const FIELD = 'text'

/** Field inside the namespace holding the custom turn-status colour. */
export const COLOR_FIELD = 'color'

/**
 * Durable section schema. Both fields default to the empty string, which means
 * "inherit": the shipped copy — in the reader's own locale — for the text, and
 * the theme's own colour for the row. A non-empty default here would silently
 * override the shipped copy for everyone who never opens the card.
 */
export const Config = z.object({
  [FIELD]: z.string().default(''),
  [COLOR_FIELD]: z.string().default(''),
})

/**
 * Register the settings namespace. No static `settings` inject: a profile
 * without a settings provider still loads this row (the browser half then keeps
 * the shipped copy), and the namespace appears only where a provider exists.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NS, Config)
  })
}
