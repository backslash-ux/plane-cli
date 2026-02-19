import { Command, Options, Args } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { IssuesResponseSchema } from "../config.js"
import { formatIssue } from "../format.js"
import { resolveProject } from "../resolve.js"
import type { State } from "../config.js"

const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project identifier — see 'plane projects list' for available identifiers"),
)

const stateOption = Options.optional(Options.text("state")).pipe(
  Options.withDescription(
    "Filter by state group (backlog | unstarted | started | completed | cancelled) or exact state name",
  ),
)

export const issuesList = Command.make(
  "list",
  { state: stateOption, project: projectArg },
  ({ project, state }) =>
    Effect.gen(function* () {
      const { key, id } = yield* resolveProject(project)
      const raw = yield* api.get(`projects/${id}/issues/?order_by=sequence_id`)
      const { results } = yield* decodeOrFail(IssuesResponseSchema, raw)

      const filtered =
        state._tag === "Some"
          ? results.filter((i) => {
              const s = i.state as State | string
              if (typeof s !== "object") return false
              const val = state.value.toLowerCase()
              return s.group === val || s.name.toLowerCase() === val
            })
          : results

      yield* Console.log(filtered.map((i) => formatIssue(i, key)).join("\n"))
    }),
).pipe(
  Command.withDescription(
    "List issues for a project ordered by sequence ID. Each line shows: REF  [state-group]  state-name  title",
  ),
)

export const issues = Command.make("issues").pipe(
  Command.withDescription(
    "List and filter issues. Use 'plane issues list --help' for filtering options.",
  ),
  Command.withSubcommands([issuesList]),
)
