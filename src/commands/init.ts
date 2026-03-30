import * as readline from "node:readline";
import { Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { decodeOrFail } from "../api.js";
import { ProjectsResponseSchema } from "../config.js";
import {
	type ConfigScope,
	getConfigDetails,
	getGlobalConfigFilePath,
	getLocalConfigFilePath,
	readGlobalStoredConfig,
	readLocalStoredConfigAtPath,
	writeGlobalStoredConfig,
	writeLocalStoredConfig,
} from "../user-config.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
	return new Promise((resolve) => rl.question(question, resolve));
}

function resolveProjectSelection(
	input: string,
	projects: ReadonlyArray<{ identifier: string; name: string }>,
	existingDefaultProject: string | undefined,
	scope: ConfigScope,
): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) {
		return existingDefaultProject;
	}
	if (trimmed === "-") {
		return scope === "global" ? "" : undefined;
	}
	const byNumber = Number.parseInt(trimmed, 10);
	if (
		Number.isInteger(byNumber) &&
		byNumber >= 1 &&
		byNumber <= projects.length
	) {
		return projects[byNumber - 1].identifier;
	}
	const byIdentifier = projects.find(
		(project) => project.identifier.toUpperCase() === trimmed.toUpperCase(),
	);
	if (byIdentifier) {
		return byIdentifier.identifier;
	}
	throw new Error(
		`Unknown project selection: ${trimmed}. Enter a number, identifier, or '-' to clear.`,
	);
}

function resolveScope(
	{ global, local }: { global: boolean; local: boolean },
	defaultScope: ConfigScope,
): Effect.Effect<ConfigScope, Error> {
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
	return Effect.succeed(defaultScope);
}

function promptLabel(
	label: string,
	scope: ConfigScope,
	existingValue: string | undefined,
	effectiveValue: string,
	options?: { hidden?: boolean; clearHint?: boolean },
): string {
	const displayValue = (value: string) =>
		options?.hidden && value ? "***" : value;

	if (scope === "local") {
		const currentValue = existingValue?.trim();
		const inheritedValue = effectiveValue.trim();
		const shownValue = currentValue
			? displayValue(currentValue)
			: inheritedValue
				? `inherit: ${displayValue(inheritedValue)}`
				: "inherit";
		const clearHint = options?.clearHint
			? " ('-' to clear)"
			: " ('-' to inherit)";
		return `${label} [${shownValue}]${clearHint}: `;
	}

	return `${label} [${displayValue(existingValue?.trim() ?? "")}]: `;
}

function resolveLocalValue(
	input: string,
	existingValue: string | undefined,
): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) {
		return existingValue?.trim() || undefined;
	}
	if (trimmed === "-") {
		return undefined;
	}
	return trimmed;
}

function resolveGlobalValue(
	input: string,
	existingValue: string | undefined,
): string {
	const trimmed = input.trim();
	return trimmed || existingValue?.trim() || "";
}

function describeValue(
	scope: ConfigScope,
	localValue: string | undefined,
	effectiveValue: string,
	options?: { hidden?: boolean },
): string {
	const displayValue = (value: string) =>
		options?.hidden && value ? "***" : value;

	if (scope === "local") {
		if (localValue?.trim()) {
			return displayValue(localValue.trim());
		}
		return effectiveValue
			? `inherit (${displayValue(effectiveValue)})`
			: "inherit";
	}

	return displayValue(effectiveValue);
}

const globalOption = Options.boolean("global").pipe(
	Options.withAlias("g"),
	Options.withDescription("Save to ~/.config/plane/config.json"),
	Options.withDefault(false),
);

const localOption = Options.boolean("local").pipe(
	Options.withAlias("l"),
	Options.withDescription(
		"Save to ./.plane/config.json in the current directory",
	),
	Options.withDefault(false),
);

function fetchProjectsForConfig(config: {
	host: string;
	workspace: string;
	token: string;
}) {
	return Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(
					`${config.host}/api/v1/workspaces/${config.workspace}/projects/`,
					{
						headers: { "X-Api-Key": config.token },
					},
				),
			catch: (error) =>
				error instanceof Error ? error : new Error(String(error)),
		});
		if (!response.ok) {
			const text = yield* Effect.tryPromise({
				try: () => response.text(),
				catch: (error) =>
					error instanceof Error ? error : new Error(String(error)),
			});
			return yield* Effect.fail(new Error(`HTTP ${response.status}: ${text}`));
		}
		const raw = yield* Effect.tryPromise({
			try: () => response.json(),
			catch: (error) =>
				error instanceof Error ? error : new Error(String(error)),
		});
		const { results } = yield* decodeOrFail(ProjectsResponseSchema, raw);
		return results;
	});
}

export function initHandler(
	{ global, local }: { global: boolean; local: boolean },
	defaultScope: ConfigScope = "global",
) {
	return Effect.gen(function* () {
		const scope = yield* resolveScope({ global, local }, defaultScope);
		const effective = getConfigDetails();
		const existing =
			scope === "global"
				? readGlobalStoredConfig()
				: readLocalStoredConfigAtPath();
		const savePath =
			scope === "global" ? getGlobalConfigFilePath() : getLocalConfigFilePath();

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const host = yield* Effect.promise(() =>
			prompt(
				rl,
				promptLabel("Plane host URL", scope, existing.host, effective.host),
			),
		);
		const workspace = yield* Effect.promise(() =>
			prompt(
				rl,
				promptLabel(
					"Workspace",
					scope,
					existing.workspace,
					effective.workspace,
				),
			),
		);
		const token = yield* Effect.promise(() =>
			prompt(
				rl,
				promptLabel("API token", scope, existing.token, effective.token, {
					hidden: true,
				}),
			),
		);

		const savedHost =
			scope === "global"
				? resolveGlobalValue(
						host,
						existing.host || effective.host || "https://plane.so",
					)
				: resolveLocalValue(host, existing.host);
		const savedWorkspace =
			scope === "global"
				? resolveGlobalValue(
						workspace,
						existing.workspace || effective.workspace,
					)
				: resolveLocalValue(workspace, existing.workspace);
		const savedToken =
			scope === "global"
				? resolveGlobalValue(token, existing.token || effective.token)
				: resolveLocalValue(token, existing.token);

		const mergedHost = (
			savedHost ??
			effective.host ??
			"https://plane.so"
		).replace(/\/$/, "");
		const mergedWorkspace = savedWorkspace ?? effective.workspace;
		const mergedToken = savedToken ?? effective.token;

		if (!mergedToken) {
			rl.close();
			yield* Effect.fail(new Error("API token is required"));
		}
		if (!mergedWorkspace) {
			rl.close();
			yield* Effect.fail(new Error("Workspace is required"));
		}

		let savedDefaultProject = existing.defaultProject;
		const projectsResult = yield* Effect.either(
			fetchProjectsForConfig({
				host: mergedHost,
				workspace: mergedWorkspace,
				token: mergedToken,
			}),
		);
		if (projectsResult._tag === "Right" && projectsResult.right.length > 0) {
			yield* Console.log("\nAvailable projects:");
			yield* Console.log(
				projectsResult.right
					.map(
						(project, index) =>
							`${index + 1}. ${project.identifier}  ${project.name}`,
					)
					.join("\n"),
			);
			const selectedProject = yield* Effect.promise(() =>
				prompt(
					rl,
					promptLabel(
						"Default project number or identifier",
						scope,
						existing.defaultProject,
						effective.defaultProject,
						{ clearHint: true },
					),
				),
			);
			savedDefaultProject = resolveProjectSelection(
				selectedProject,
				projectsResult.right,
				existing.defaultProject,
				scope,
			);
		} else if (projectsResult._tag === "Left") {
			yield* Console.log(
				`\nWarning: could not load projects for selection (${projectsResult.left.message}). Continuing without changing the current-project override.`,
			);
		}

		rl.close();

		if (scope === "global") {
			writeGlobalStoredConfig({
				host: mergedHost,
				workspace: mergedWorkspace,
				token: mergedToken,
				defaultProject: savedDefaultProject,
			});
		} else {
			writeLocalStoredConfig(
				{
					host: savedHost,
					workspace: savedWorkspace,
					token: savedToken,
					defaultProject: savedDefaultProject,
				},
				{ target: "cwd" },
			);
		}

		yield* Console.log(
			`\n${scope === "global" ? "Global" : "Local"} config saved to ${savePath}`,
		);
		yield* Console.log(
			`  Host:      ${describeValue(scope, savedHost, mergedHost)}`,
		);
		yield* Console.log(
			`  Workspace: ${describeValue(scope, savedWorkspace, mergedWorkspace)}`,
		);
		yield* Console.log(`  Token:     ***`);
		if ((savedDefaultProject ?? effective.defaultProject).trim()) {
			yield* Console.log(
				`  Project:   ${describeValue(
					scope,
					savedDefaultProject,
					savedDefaultProject ?? effective.defaultProject,
				)}`,
			);
		}
	});
}

export const init = Command.make(
	"init",
	{ global: globalOption, local: localOption },
	(options) => initHandler(options, "global"),
).pipe(
	Command.withDescription(
		"Interactive setup. Defaults to global config, supports --global/-g and --local/-l, and can save an optional current-project override.",
	),
);

export const localInit = Command.make("init", {}, () =>
	initHandler({ global: false, local: true }, "local"),
).pipe(
	Command.withDescription(
		"Interactive local setup. Saves overrides to ./.plane/config.json in the current directory.",
	),
);
