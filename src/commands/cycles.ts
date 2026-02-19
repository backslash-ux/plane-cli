import { Command, Args } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { CyclesResponseSchema, CycleIssuesResponseSchema } from "../config.js"
import { resolveProject, parseIssueRef, findIssueBySeq } from "../resolve.js"

const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
)

const cycleIdArg = Args.text({ name: "cycle-id" }).pipe(
  Args.withDescription("Cycle UUID (from 'plane cycles list PROJECT')"),
)

// --- cycles list ---

export const cyclesList = Command.make("list", { project: projectArg }, ({ project }) =>
  Effect.gen(function* () {
    const { id } = yield* resolveProject(project)
    const raw = yield* api.get(`projects/${id}/cycles/`)
    const { results } = yield* decodeOrFail(CyclesResponseSchema, raw)
    if (results.length === 0) {
      yield* Console.log("No cycles found")
      return
    }
    const lines = results.map((c) => {
      const start = c.start_date ?? "—"
      const end = c.end_date ?? "—"
      const status = (c.status ?? "?").padEnd(10)
      return `${c.id}  ${status}  ${start} → ${end}  ${c.name}`
    })
    yield* Console.log(lines.join("\n"))
  }),
).pipe(
  Command.withDescription(
    "List cycles for a project. Shows cycle UUID, status, date range, and name.\n\nExample:\n  plane cycles list PROJ",
  ),
)

// --- cycles issues list ---

export const cycleIssuesList = Command.make(
  "list",
  { project: projectArg, cycleId: cycleIdArg },
  ({ project, cycleId }) =>
    Effect.gen(function* () {
      const { key, id } = yield* resolveProject(project)
      const raw = yield* api.get(`projects/${id}/cycles/${cycleId}/cycle-issues/`)
      const { results } = yield* decodeOrFail(CycleIssuesResponseSchema, raw)
      if (results.length === 0) {
        yield* Console.log("No issues in cycle")
        return
      }
      const lines = results.map((ci) => {
        if (ci.issue_detail) {
          const seq = String(ci.issue_detail.sequence_id).padStart(3, " ")
          return `${key}-${seq}  ${ci.issue_detail.name}  (${ci.id})`
        }
        return `${ci.issue}  (cycle-issue: ${ci.id})`
      })
      yield* Console.log(lines.join("\n"))
    }),
).pipe(
  Command.withDescription(
    "List issues in a cycle.\n\nExample:\n  plane cycles issues list PROJ <cycle-id>",
  ),
)

// --- cycles issues add ---

const issueRefArg = Args.text({ name: "ref" }).pipe(
  Args.withDescription("Issue reference to add (e.g. PROJ-29)"),
)

export const cycleIssuesAdd = Command.make(
  "add",
  { project: projectArg, cycleId: cycleIdArg, ref: issueRefArg },
  ({ project, cycleId, ref }) =>
    Effect.gen(function* () {
      const { id: projectId } = yield* resolveProject(project)
      const { seq } = yield* parseIssueRef(ref)
      const issue = yield* findIssueBySeq(projectId, seq)
      yield* api.post(`projects/${projectId}/cycles/${cycleId}/cycle-issues/`, {
        issues: [issue.id],
      })
      yield* Console.log(`Added ${ref} to cycle ${cycleId}`)
    }),
).pipe(
  Command.withDescription(
    "Add an issue to a cycle.\n\nExample:\n  plane cycles issues add PROJ <cycle-id> PROJ-29",
  ),
)

// --- cycles issues (parent) ---

export const cycleIssues = Command.make("issues").pipe(
  Command.withDescription("Manage issues within a cycle. Subcommands: list, add"),
  Command.withSubcommands([cycleIssuesList, cycleIssuesAdd]),
)

// --- cycles (parent) ---

export const cycles = Command.make("cycles").pipe(
  Command.withDescription(
    "Manage cycles (sprints). Subcommands: list, issues\n\nExamples:\n  plane cycles list PROJ\n  plane cycles issues list PROJ <cycle-id>\n  plane cycles issues add PROJ <cycle-id> PROJ-29",
  ),
  Command.withSubcommands([cyclesList, cycleIssues]),
)
