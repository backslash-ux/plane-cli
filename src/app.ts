import { Command } from "@effect/cli";
import { cycles } from "./commands/cycles.js";
import { init } from "./commands/init.js";
import { intake } from "./commands/intake.js";
import { issue } from "./commands/issue.js";
import { issues } from "./commands/issues.js";
import { labels } from "./commands/labels.js";
import { local } from "./commands/local.js";
import { members } from "./commands/members.js";
import { modules } from "./commands/modules.js";
import { pages } from "./commands/pages.js";
import { projects } from "./commands/projects.js";
import { states } from "./commands/states.js";

const plane = Command.make("plane").pipe(
	Command.withDescription(
		`CLI for the Plane project management API. Useful for humans and AI agents/bots.

CONFIGURATION
  Global config: ~/.config/plane/config.json
  Local config:  nearest .plane/config.json from the current directory upward
  Env vars:     PLANE_API_TOKEN
                PLANE_HOST
                PLANE_WORKSPACE
                PLANE_PROJECT for a default project identifier
  Precedence:   env vars > local config > global config

QUICK START
  plane init -g                       Interactive global setup
  plane init --local                  Interactive local setup in the current directory
  plane . init                        Local setup alias for the current directory
  plane projects list                 List projects and their identifiers
  plane projects use PROJ             Save a current project in the active config scope
  plane projects use PROJ --global    Force the saved current project into global config
  plane projects use PROJ --local     Force the saved current project into local config
  plane issues list                   List issues for the saved current project
  plane issues list PROJ              List issues for a project
  plane issue get PROJ-29             Get full JSON for an issue
  plane issue create PROJ "title"     Create an issue
  plane issue create @current "title" Create an issue in the saved current project
  plane issue update --state done PROJ-29
  plane issue comment PROJ-29 "text"  Add a comment

CONCEPTS
  Project identifier  Short string shown by 'plane projects list' (e.g. ACME, WEB)
  Issue ref           Identifier + sequence number (e.g. ACME-29, WEB-5)
  State groups        backlog | unstarted | started | completed | cancelled
  Priorities          urgent | high | medium | low | none

ALL SUBCOMMANDS
  init                Set up global or local config interactively
  .                   local init
  projects            list | current | use
  issues list         List issues (supports --state, --assignee, --priority)
  issue               get | create | update | delete | comment | activity |
                      link | comments | worklogs
  cycles              list | issues (list, add)
  modules             list | issues (list, add, remove)
  intake              list | accept | reject
  pages               list | get | create | update | delete | archive | unarchive | lock | unlock | duplicate
  states list         List workflow states for a project
  labels list         List labels for a project
  members list        List members of a project

FOR AI AGENTS / BOTS
  - Add --json to any list command for JSON output (array of objects)
  - Add --xml to any list command for XML output
  - 'plane issue get PROJ-N' always outputs full JSON
  - Use PLANE_API_TOKEN to avoid 'plane init'
  - Use PLANE_HOST for self-hosted Plane instances
  - Use PLANE_WORKSPACE to select the workspace
  - Use PLANE_PROJECT or 'plane projects use PROJ' to persist a current project
  - Local config lives in '.plane/config.json' and is resolved from the current directory upward
  - Full Plane REST API reference (180+ endpoints):
    https://developers.plane.so/api-reference/introduction`,
	),
	Command.withSubcommands([
		local,
		init,
		projects,
		issues,
		issue,
		states,
		labels,
		members,
		cycles,
		modules,
		intake,
		pages,
	]),
);

export const cli = Command.run(plane, {
	name: "plane",
	version: "0.1.11",
});
