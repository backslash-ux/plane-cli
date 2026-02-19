import { Effect, Schema } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

const CONFIG_FILE = path.join(os.homedir(), ".config", "plane", "config.json")

function readConfigFile(): Partial<{ token: string; host: string; workspace: string }> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
  } catch {
    return {}
  }
}

function getConfig() {
  const file = readConfigFile()
  return {
    token: process.env["PLANE_API_TOKEN"] ?? file.token ?? "",
    host: (process.env["PLANE_HOST"] ?? file.host ?? "https://plane.so").replace(/\/$/, ""),
    workspace: process.env["PLANE_WORKSPACE"] ?? file.workspace ?? "",
  }
}

function request(
  method: string,
  path: string,
  body?: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.tryPromise({
    try: async () => {
      const { token, host, workspace } = getConfig()
      let url = `${host}/api/v1/workspaces/${workspace}/${path}`

      // Always expand state on issue list/get calls (not intake-issues/ or cycle-issues/)
      if (method === "GET" && /(?:^|\/)(issues\/)/.test(path)) {
        url += url.includes("?") ? "&expand=state" : "?expand=state"
      }

      const headers: Record<string, string> = {
        "X-Api-Key": token,
      }
      if (body !== undefined) {
        headers["Content-Type"] = "application/json"
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }

      // 204 No Content
      if (res.status === 204) return null

      return res.json()
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  })
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body: unknown) => request("POST", path, body),
  patch: (path: string, body: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
}

export function decodeOrFail<A, I>(
  schema: Schema.Schema<A, I>,
  data: unknown,
): Effect.Effect<A, Error> {
  return Schema.decodeUnknown(schema)(data).pipe(
    Effect.mapError((e) => new Error(String(e))),
  )
}
