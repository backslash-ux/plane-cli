import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { issue } from "./commands/issue.js"
import { issues } from "./commands/issues.js"
import { states } from "./commands/states.js"
import { labels } from "./commands/labels.js"
import { members } from "./commands/members.js"
import { cycles } from "./commands/cycles.js"
import { modules } from "./commands/modules.js"
import { intake } from "./commands/intake.js"
import { pages } from "./commands/pages.js"
import { projects } from "./commands/projects.js"
import { init } from "./commands/init.js"

const plane = Command.make("plane").pipe(
  Command.withDescription(
    `CLI for the Plane project management API. Useful for humans and AI agents/bots.

CONFIGURATION
  Config file:  ~/.config/plane/config.json  (written by 'plane init')
  Env vars:     PLANE_API_TOKEN, PLANE_HOST, PLANE_WORKSPACE
  Env vars take priority over the config file.

QUICK START
  plane init                          Interactive setup — saves host/workspace/token
  plane projects list                 List projects and their identifiers
  plane issues list PROJ              List issues for a project
  plane issue get PROJ-29             Get full JSON for an issue
  plane issue create PROJ "title"     Create an issue
  plane issue update --state done PROJ-29
  plane issue comment PROJ-29 "text"  Add a comment

CONCEPTS
  Project identifier  Short string shown by 'plane projects list' (e.g. ACME, WEB)
  Issue ref           Identifier + sequence number (e.g. ACME-29, WEB-5)
  State groups        backlog | unstarted | started | completed | cancelled
  Priorities          urgent | high | medium | low | none

ALL SUBCOMMANDS
  init                Set up config interactively
  projects list       List all projects
  issues list         List issues (supports --state filter)
  issue               get | create | update | delete | comment | activity |
                      link | comments | worklogs
  cycles              list | issues (list, add)
  modules             list | issues (list, add, remove)
  intake              list | accept | reject
  pages               list | get
  states list         List workflow states for a project
  labels list         List labels for a project
  members list        List members of a project

FOR AI AGENTS / BOTS
  - Add --json to any list command for JSON output (array of objects)
  - Add --xml to any list command for XML output
  - 'plane issue get PROJ-N' always outputs full JSON
  - Use PLANE_API_TOKEN / PLANE_HOST / PLANE_WORKSPACE env vars to avoid 'plane init'
  - Full Plane REST API reference (180+ endpoints):
    https://developers.plane.so/api-reference/introduction`,
  ),
  Command.withSubcommands([init, projects, issues, issue, states, labels, members, cycles, modules, intake, pages]),
)

const cli = Command.run(plane, {
  name: "plane",
  version: "0.1.0",
})

Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(Layer.mergeAll(NodeContext.layer)),
  NodeRuntime.runMain,
)
