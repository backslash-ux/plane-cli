import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { MembersResponseSchema } from "../config.js"
import { jsonMode, xmlMode, toXml } from "../output.js"

export const membersList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const raw = yield* api.get("members/")
    const results = yield* decodeOrFail(MembersResponseSchema, raw)
    if (jsonMode) { yield* Console.log(JSON.stringify(results, null, 2)); return }
    if (xmlMode) { yield* Console.log(toXml(results)); return }
    const lines = results.map((m) => {
      const email = m.email ? `  <${m.email}>` : ""
      return `${m.display_name.padEnd(24)}${email}`
    })
    yield* Console.log(lines.join("\n"))
  }),
)

export const members = Command.make("members").pipe(
  Command.withSubcommands([membersList]),
)
