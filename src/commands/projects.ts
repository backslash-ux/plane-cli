import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { ProjectsResponseSchema } from "../config.js"
import { jsonMode, xmlMode, toXml } from "../output.js"

export const projectsList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const raw = yield* api.get("projects/")
    const { results } = yield* decodeOrFail(ProjectsResponseSchema, raw)
    if (jsonMode) { yield* Console.log(JSON.stringify(results, null, 2)); return }
    if (xmlMode) { yield* Console.log(toXml(results)); return }
    const lines = results.map(
      (p) => `${p.identifier.padEnd(6)}  ${p.id}  ${p.name}`,
    )
    yield* Console.log(lines.join("\n"))
  }),
).pipe(
  Command.withDescription(
    "List all projects in the workspace. The IDENTIFIER column is what you pass to other commands (e.g. 'plane issues list PROJ').",
  ),
)

export const projects = Command.make("projects").pipe(
  Command.withDescription("Manage projects."),
  Command.withSubcommands([projectsList]),
)
