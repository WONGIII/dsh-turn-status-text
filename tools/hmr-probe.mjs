/**
 * Dev utility: watch the client hot-reload channel.
 *
 * Prints every frame the running host broadcasts on /plugins/events while bundle
 * edits happen. A `rebuilt <this package>` line after saving lib/client.js is the
 * proof that the change reaches an already-open GUI without a page refresh.
 *
 * Usage: node tools/hmr-probe.mjs [seconds] [url]
 */
const seconds = Number(process.argv[2] ?? 15)
const url = process.argv[3] ?? 'http://127.0.0.1:3080/plugins/events'

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), seconds * 1000)
let buffer = ''

try {
  const response = await fetch(url, { signal: controller.signal })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      if (!frame.startsWith('data: ')) continue
      const parsed = JSON.parse(frame.slice(6))
      if (parsed.type === 'rebuilt') console.log('rebuilt', parsed.id, parsed.rev)
      else if (parsed.type === 'graph') console.log('graph', parsed.graph.rev, parsed.graph.entries.length, 'entries')
    }
  }
} catch (error) {
  if (error.name !== 'AbortError') throw error
} finally {
  clearTimeout(timer)
}

console.log(`probe window closed after ${seconds}s`)
