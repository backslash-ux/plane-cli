import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import * as readline from "node:readline"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

export const CONFIG_DIR = path.join(os.homedir(), ".config", "plane")
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

export interface PlaneConfig {
  token: string
  host: string
  workspace: string
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

export const init = Command.make("init", {}, () =>
  Effect.gen(function* () {
    let existing: Partial<PlaneConfig> = {}
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
    } catch {
      // no existing config
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const host = yield* Effect.promise(() =>
      prompt(rl, `Plane host [${existing.host ?? "https://plane.so"}]: `),
    )
    const workspace = yield* Effect.promise(() =>
      prompt(rl, `Workspace slug [${existing.workspace ?? ""}]: `),
    )
    const token = yield* Effect.promise(() =>
      prompt(rl, `API token [${existing.token ? "***" : ""}]: `),
    )

    rl.close()

    const config: PlaneConfig = {
      host: host.trim() || existing.host || "https://plane.so",
      workspace: workspace.trim() || existing.workspace || "",
      token: token.trim() || existing.token || "",
    }

    if (!config.token) {
      yield* Effect.fail(new Error("API token is required"))
    }
    if (!config.workspace) {
      yield* Effect.fail(new Error("Workspace slug is required"))
    }

    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 })

    yield* Console.log(`\nConfig saved to ${CONFIG_FILE}`)
    yield* Console.log(`  Host:      ${config.host}`)
    yield* Console.log(`  Workspace: ${config.workspace}`)
    yield* Console.log(`  Token:     ***`)
  }),
).pipe(
  Command.withDescription(
    "Interactive setup. Prompts for host, workspace slug, and API token, then saves to ~/.config/plane/config.json (mode 0600). Safe to re-run — existing values shown as defaults.",
  ),
)
