import { Command, Options, Args } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { StatesResponseSchema } from "../config.js"
import { resolveProject } from "../resolve.js"

const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
)

export const statesList = Command.make(
  "list",
  { project: projectArg },
  ({ project }) =>
    Effect.gen(function* () {
      const { id } = yield* resolveProject(project)
      const raw = yield* api.get(`projects/${id}/states/`)
      const { results } = yield* decodeOrFail(StatesResponseSchema, raw)
      const lines = results.map(
        (s) => `${s.id}  ${s.group.padEnd(12)}  ${s.name}`,
      )
      yield* Console.log(lines.join("\n"))
    }),
)

export const states = Command.make("states").pipe(
  Command.withSubcommands([statesList]),
)
