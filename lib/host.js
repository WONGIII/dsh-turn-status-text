/**
 * dsh-turn-status-text (host half)
 *
 * The row's own Config *is* this plugin's settings section: the Host projects the
 * schema a Loader row declares into the settings directory, the Plugins page
 * renders a form for it, and the browser half reads the same values through
 * `ctx.configForms.get(NS)`. Nothing has to be registered by hand, and the row id
 * declared in cordis.patch.yml is the namespace all three sides agree on.
 *
 * `@deepseek-ai/schemastery` is the schema language every settings section is
 * written in (declared as a dependency; the harness ships the same version).
 */

import z from '@deepseek-ai/schemastery'

/** Plugin name (diagnostics and loader identity). */
export const name = '@dsh-external/dsh-turn-status-text'

/** Settings entry this plugin is configured through: the id of the row it mounts. */
export const NS = 'dsh-turn-status-text'

/** Field inside the entry holding the custom turn-status text. */
export const FIELD = 'text'

/** Field inside the entry holding the custom turn-status colour. */
export const COLOR_FIELD = 'color'

/**
 * The row's Config schema. Both fields are `volatile()`: that is what makes them
 * editable from the Plugins page without remounting the row, and what keeps the
 * value the browser half reads live.
 *
 * Empty defaults mean "inherit": the shipped copy — in the reader's own locale —
 * for the text, and the theme's own colour for the row. A non-empty default here
 * would silently override the shipped copy for everyone who never opens the card.
 */
export const Config = z.object({
  [FIELD]: z.string().default('').volatile(),
  [COLOR_FIELD]: z.string().default('').volatile(),
})

/**
 * Mount the plugin. The host half owns no service: the platform projects this
 * row's Config into the settings directory on its own, and the browser half does
 * the rendering.
 */
export function apply() {}
