const jsonIdx = process.argv.indexOf("--json")
const xmlIdx = process.argv.indexOf("--xml")

export const jsonMode = jsonIdx !== -1
export const xmlMode = xmlIdx !== -1

if (jsonIdx !== -1) process.argv.splice(jsonIdx, 1)
if (xmlIdx !== -1) process.argv.splice(xmlIdx, 1)

function escapeXml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function toXmlItem(obj: unknown, tag = "item"): string {
  if (obj === null || typeof obj !== "object") {
    return `<${tag}>${escapeXml(obj)}</${tag}>`
  }
  const attrs = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v === null || typeof v !== "object")
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ")
  const children = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v !== null && typeof v === "object")
    .map(([k, v]) =>
      Array.isArray(v)
        ? `<${k}>${v.map((i) => toXmlItem(i)).join("")}</${k}>`
        : toXmlItem(v, k),
    )
    .join("")
  return `<${tag}${attrs ? " " + attrs : ""}>${children}</${tag}>`
}

export function toXml(results: readonly unknown[]): string {
  return `<results>\n${results.map((r) => "  " + toXmlItem(r)).join("\n")}\n</results>`
}
