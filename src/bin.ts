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
    `CLI for the Plane project management API.

Config is loaded from ~/.config/plane/config.json (written by 'plane init').
Override any value with env vars: PLANE_API_TOKEN, PLANE_HOST, PLANE_WORKSPACE.

Quick start:
  plane init                          Prompt for host/workspace/token and save config
  plane projects list                 List all projects (shows identifier used in other commands)
  plane issues list PROJ              List issues for a project
  plane issue create PROJ "title"     Create a new issue
  plane issue update --state done REF Mark an issue complete

Project identifiers are short strings like PROJ, WEB, OPS.
Issue refs combine identifier + sequence number: PROJ-29, WEB-5.

State groups: backlog | unstarted | started | completed | cancelled
Priorities:   urgent | high | medium | low | none

Full Plane API reference (180+ endpoints not all covered here):
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
