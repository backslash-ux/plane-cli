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
import { stats } from "./commands/stats.js";

export const VERSION = "1.2.0";

export function isRootHelpRequest(argv: ReadonlyArray<string>): boolean {
	const args = argv.slice(2);
	return (
		args.length === 0 ||
		(args.length === 1 && (args[0] === "--help" || args[0] === "-h"))
	);
}

export function renderRootHelp(version = VERSION): string {
	return `plane ${version}

Usage:
  plane <command> [subcommand] [options]
  plane <command> --help

Setup:
  plane init -g
  plane init --local
  plane projects list
  plane projects use PROJ

Common commands:
  projects    list, current, use
  issues      list
  issue       get, create, update, delete, comment, activity, relation, link, comments, worklogs
  cycles      list, create, update, delete, issues
  modules     list, create, delete, issues
  intake      list, accept, reject
  pages       list, get, create, update, delete, archive, unarchive, lock, unlock, duplicate
  states      list
  labels      list, create, delete
  members     list
  stats       project or workspace rollups

Config:
  Global:     ~/.config/plane/config.json
  Local:      nearest .plane/config.json upward from the current directory
  Env:        PLANE_API_TOKEN, PLANE_HOST, PLANE_WORKSPACE, PLANE_PROJECT
  Resolution: env vars > local config > global config

Agent notes:
  Add --json or --xml to list commands.
  plane issue get PROJ-29 returns full JSON with parent_issue and child_issues summaries.
  plane init --local writes .plane/project-context.json and updates AGENTS.md.

Use 'plane <command> --help' for detailed syntax and options.
API reference: https://developers.plane.so/api-reference/introduction`;
}

const plane = Command.make("plane").pipe(
	Command.withDescription(
		"CLI for the Plane project management API. Use 'plane <command> --help' for detailed command help.",
	),
	Command.withSubcommands([
		local,
		init,
		projects,
		issues,
		issue,
		states,
		stats,
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
	version: VERSION,
});
