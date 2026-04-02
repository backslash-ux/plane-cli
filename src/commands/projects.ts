import { Args, Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { isProjectArchived } from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { listProjects, resolveProject } from "../resolve.js";
import {
	type ConfigScope,
	getConfigDetails,
	getDefaultConfigWriteScope,
	readLocalStoredConfig,
	readStoredConfig,
	writeLocalStoredConfig,
	writeStoredConfig,
} from "../user-config.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
);

const globalOption = Options.boolean("global").pipe(
	Options.withAlias("g"),
	Options.withDescription("Write the current project to global config"),
	Options.withDefault(false),
);

const localOption = Options.boolean("local").pipe(
	Options.withAlias("l"),
	Options.withDescription("Write the current project to local config"),
	Options.withDefault(false),
);

const includeArchivedOption = Options.boolean("include-archived").pipe(
	Options.withDescription("Include archived projects in the results"),
	Options.withDefault(false),
);

function resolveWriteScope({
	global,
	local,
}: {
	global: boolean;
	local: boolean;
}): Effect.Effect<ConfigScope, Error> {
	if (global && local) {
		return Effect.fail(
			new Error("Choose either --global or --local, not both."),
		);
	}
	if (local) {
		return Effect.succeed("local");
	}
	if (global) {
		return Effect.succeed("global");
	}
	return Effect.succeed(getDefaultConfigWriteScope());
}

function describeProjectSource(source: string): string {
	switch (source) {
		case "env":
			return "env";
		case "local":
			return "local";
		case "global":
			return "global";
		default:
			return "config";
	}
}

export function projectsListHandler({
	includeArchived = false,
}: {
	includeArchived?: boolean;
} = {}) {
	return Effect.gen(function* () {
		const results = yield* listProjects({ includeArchived });
		const currentProject = getConfigDetails().defaultProject.toUpperCase();
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		const lines = results.map((project) => {
			const marker =
				currentProject === project.identifier.toUpperCase() ? "*" : " ";
			const archivedSuffix = isProjectArchived(project) ? "  (archived)" : "";
			return `${marker} ${project.identifier.padEnd(6)}  ${project.id}  ${project.name}${archivedSuffix}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const projectsList = Command.make(
	"list",
	{ includeArchived: includeArchivedOption },
	projectsListHandler,
).pipe(
	Command.withDescription(
		"List workspace projects, excluding archived ones by default. The IDENTIFIER column is what you pass to other commands. A leading '*' marks the saved current project. Add --include-archived to include archived projects.",
	),
);

export function projectsCurrentHandler() {
	return Effect.gen(function* () {
		const config = getConfigDetails();
		const configuredProject = config.defaultProject;
		if (!configuredProject) {
			return yield* Effect.fail(
				new Error(
					"No default project configured. Run 'plane init', 'plane init --local', 'plane . init', or 'plane projects use PROJ'.",
				),
			);
		}
		const source = describeProjectSource(config.sources.defaultProject);
		const { key, id } = yield* resolveProject("@current");
		const results = yield* listProjects({ includeArchived: true });
		const project = results.find((candidate) => candidate.id === id);
		if (!project) {
			yield* Console.log(`${key}  (${source})`);
			return;
		}
		yield* Console.log(
			`${project.identifier}  ${project.id}  ${project.name}  (${source})`,
		);
	});
}

export const projectsCurrent = Command.make(
	"current",
	{},
	projectsCurrentHandler,
).pipe(
	Command.withDescription(
		"Show the effective current project and whether it came from env, local config, or global config.",
	),
);

export function projectsUseHandler({
	project,
	global,
	local,
}: {
	project: string;
	global: boolean;
	local: boolean;
}) {
	return Effect.gen(function* () {
		const scope = yield* resolveWriteScope({ global, local });
		const { key } = yield* resolveProject(project);
		if (scope === "local") {
			const existing = readLocalStoredConfig();
			writeLocalStoredConfig(
				{
					...existing,
					defaultProject: key,
				},
				{ target: "active" },
			);
		} else {
			const existing = readStoredConfig();
			writeStoredConfig({
				...existing,
				defaultProject: key,
			});
		}
		yield* Console.log(`Current project set to ${key} (${scope})`);
	});
}

export const projectsUse = Command.make(
	"use",
	{ project: projectArg, global: globalOption, local: localOption },
	projectsUseHandler,
).pipe(
	Command.withDescription(
		"Persist a current project. Defaults to local scope when a local config is active in the current path; use --global or --local to force the target scope.",
	),
);

export const projects = Command.make("projects").pipe(
	Command.withDescription("Manage projects."),
	Command.withSubcommands([projectsList, projectsCurrent, projectsUse]),
);
