import { Command, Args } from "@effect/cli"
import { Console, Effect } from "effect"
import { api, decodeOrFail } from "../api.js"
import { PagesResponseSchema, PageSchema } from "../config.js"
import { resolveProject } from "../resolve.js"
import { jsonMode, xmlMode, toXml } from "../output.js"

const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
)

// --- pages list ---

export const pagesList = Command.make("list", { project: projectArg }, ({ project }) =>
  Effect.gen(function* () {
    const { id } = yield* resolveProject(project)
    const raw = yield* api.get(`projects/${id}/pages/`)
    const { results } = yield* decodeOrFail(PagesResponseSchema, raw)
    if (jsonMode) { yield* Console.log(JSON.stringify(results, null, 2)); return }
    if (xmlMode) { yield* Console.log(toXml(results)); return }
    if (results.length === 0) {
      yield* Console.log("No pages")
      return
    }
    const lines = results.map((p) => {
      const updated = (p.updated_at ?? p.created_at).slice(0, 10)
      return `${p.id}  ${updated}  ${p.name}`
    })
    yield* Console.log(lines.join("\n"))
  }),
).pipe(
  Command.withDescription(
    "List pages for a project. Shows page UUID, last updated date, and title.\n\nExample:\n  plane pages list PROJ",
  ),
)

// --- pages get ---

const pageIdArg = Args.text({ name: "page-id" }).pipe(
  Args.withDescription("Page UUID (from 'plane pages list')"),
)

export const pagesGet = Command.make(
  "get",
  { project: projectArg, pageId: pageIdArg },
  ({ project, pageId }) =>
    Effect.gen(function* () {
      const { id } = yield* resolveProject(project)
      const raw = yield* api.get(`projects/${id}/pages/${pageId}/`)
      const page = yield* decodeOrFail(PageSchema, raw)
      yield* Console.log(JSON.stringify(page, null, 2))
    }),
).pipe(
  Command.withDescription(
    "Print full JSON for a page including description_html.\n\nExample:\n  plane pages get PROJ <page-id>",
  ),
)

// --- pages (parent) ---

export const pages = Command.make("pages").pipe(
  Command.withDescription(
    "Manage project pages (documentation). Subcommands: list, get\n\nExamples:\n  plane pages list PROJ\n  plane pages get PROJ <page-id>",
  ),
  Command.withSubcommands([pagesList, pagesGet]),
)
