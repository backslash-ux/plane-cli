import * as readline from "node:readline";
import { Command, Options } from "@effect/cli";
import { Console, Effect, type Schema } from "effect";
import { decodeOrFail } from "../api.js";
import {
	EstimatePointsResponseSchema,
	EstimateSchema,
	isProjectIntakeEnabled,
	LabelsResponseSchema,
	ProjectDetailSchema,
	ProjectsResponseSchema,
	StatesResponseSchema,
} from "../config.js";
import {
	getLocalAgentsFilePath,
	hasSkillSectionInAgentsFile,
	importSkillIntoAgentsFile,
	readPackageSkillContent,
	writeLocalProjectAgentsFile,
} from "../project-agents.js";
import {
	buildProjectContextSnapshot,
	getLocalProjectContextFilePath,
	writeLocalProjectContextSnapshot,
} from "../project-context.js";
import {
	type ConfigScope,
	getConfigDetails,
	getGlobalConfigFilePath,
	getLocalConfigFilePath,
	normalizeHost,
	readGlobalStoredConfig,
	readLocalStoredConfigAtPath,
	writeGlobalStoredConfig,
	writeLocalStoredConfig,
} from "../user-config.js";

interface ProjectFeatureSummary {
	label: string;
	enabled: boolean;
}

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
	return fetchDecodedFromConfig(
		ProjectsResponseSchema,
		config,
		"projects/",
	).pipe(Effect.map(({ results }) => results));
}

function requestJsonFromConfig(
	config: {
		host: string;
		workspace: string;
		token: string;
	},
	path: string,
) {
	return Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(`${config.host}/api/v1/workspaces/${config.workspace}/${path}`, {
					headers: { "X-Api-Key": config.token },
				}),
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
		return raw;
	});
}

function fetchDecodedFromConfig<A, I>(
	schema: Schema.Schema<A, I>,
	config: {
		host: string;
		workspace: string;
		token: string;
	},
	path: string,
) {
	return requestJsonFromConfig(config, path).pipe(
		Effect.flatMap((raw) => decodeOrFail(schema, raw)),
	);
}

function fetchLocalProjectHelperForConfig(
	config: {
		host: string;
		workspace: string;
		token: string;
	},
	project: { id: string; identifier: string; name: string },
) {
	return Effect.gen(function* () {
		const detail = yield* fetchDecodedFromConfig(
			ProjectDetailSchema,
			config,
			`projects/${project.id}/`,
		);
		const { results: states } = yield* fetchDecodedFromConfig(
			StatesResponseSchema,
			config,
			`projects/${project.id}/states/`,
		);
		const { results: labels } = yield* fetchDecodedFromConfig(
			LabelsResponseSchema,
			config,
			`projects/${project.id}/labels/`,
		);

		let estimate: import("../config.js").Estimate | null = null;
		let estimatePoints: readonly import("../config.js").EstimatePoint[] = [];
		if (detail.estimate) {
			const estimateResult = yield* Effect.either(
				Effect.gen(function* () {
					const est = yield* fetchDecodedFromConfig(
						EstimateSchema,
						config,
						`projects/${project.id}/estimates/`,
					);
					const pts = yield* fetchDecodedFromConfig(
						EstimatePointsResponseSchema,
						config,
						`projects/${project.id}/estimates/${est.id}/estimate-points/`,
					);
					return { est, pts };
				}),
			);
			if (estimateResult._tag === "Right") {
				estimate = estimateResult.right.est;
				estimatePoints = estimateResult.right.pts;
			}
		}

		return {
			detail,
			snapshot: buildProjectContextSnapshot({
				project,
				detail,
				states,
				labels,
				estimate,
				estimatePoints,
			}),
		};
	});
}

function summarizeProjectFeatures(project: {
	cycle_view: boolean;
	module_view: boolean;
	issue_views_view: boolean;
	page_view: boolean;
	inbox_view?: boolean;
	intake_view?: boolean;
}): ProjectFeatureSummary[] {
	return [
		{ label: "Cycles", enabled: project.cycle_view },
		{ label: "Modules", enabled: project.module_view },
		{ label: "Views", enabled: project.issue_views_view },
		{ label: "Pages", enabled: project.page_view },
		{ label: "Intake", enabled: isProjectIntakeEnabled(project) },
	];
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

		let savedHost: string | undefined;
		let savedWorkspace: string | undefined;
		let savedToken: string | undefined;
		let savedDefaultProject = existing.defaultProject;
		let normalizedHost = "";
		let mergedWorkspace = "";
		let mergedToken = "";
		let projectsResult: import("effect").Either.Either<
			ReadonlyArray<{ id: string; identifier: string; name: string }>,
			Error
		>;

		try {
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

			savedHost =
				scope === "global"
					? resolveGlobalValue(
							host,
							existing.host || effective.host || "https://plane.so",
						)
					: resolveLocalValue(host, existing.host);
			savedWorkspace =
				scope === "global"
					? resolveGlobalValue(
							workspace,
							existing.workspace || effective.workspace,
						)
					: resolveLocalValue(workspace, existing.workspace);
			savedToken =
				scope === "global"
					? resolveGlobalValue(token, existing.token || effective.token)
					: resolveLocalValue(token, existing.token);

			const mergedHost = savedHost ?? effective.host ?? "https://plane.so";
			normalizedHost = normalizeHost(mergedHost);
			mergedWorkspace = savedWorkspace ?? effective.workspace;
			mergedToken = savedToken ?? effective.token;

			if (!mergedToken) {
				yield* Effect.fail(new Error("API token is required"));
			}
			if (!mergedWorkspace) {
				yield* Effect.fail(new Error("Workspace is required"));
			}

			projectsResult = yield* Effect.either(
				fetchProjectsForConfig({
					host: normalizedHost,
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
		} finally {
			rl.close();
		}

		if (scope === "global") {
			writeGlobalStoredConfig({
				host: normalizedHost,
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

		const hostForDisplay =
			scope === "global"
				? normalizedHost
				: savedHost
					? normalizeHost(savedHost)
					: normalizedHost;

		yield* Console.log(
			`\n${scope === "global" ? "Global" : "Local"} config saved to ${savePath}`,
		);
		yield* Console.log(
			`  Host:      ${describeValue(scope, savedHost, hostForDisplay)}`,
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

		const activeDefaultProject =
			savedDefaultProject ?? effective.defaultProject;
		if (scope === "local" && activeDefaultProject) {
			const selectedProject =
				projectsResult?._tag === "Right"
					? projectsResult?.right.find(
							(project) =>
								project.identifier.toUpperCase() ===
								activeDefaultProject.toUpperCase(),
						)
					: undefined;
			if (selectedProject) {
				const projectHelper = yield* Effect.either(
					fetchLocalProjectHelperForConfig(
						{
							host: normalizedHost,
							workspace: mergedWorkspace,
							token: mergedToken,
						},
						selectedProject,
					),
				);
				if (projectHelper._tag === "Right") {
					yield* Console.log("\nProject feature flags:");
					const featureSummary = summarizeProjectFeatures(
						projectHelper.right.detail,
					);
					for (const feature of featureSummary) {
						yield* Console.log(
							`  ${feature.label}: ${feature.enabled ? "enabled" : "disabled"}`,
						);
					}
					const disabled = featureSummary
						.filter((feature) => !feature.enabled)
						.map((feature) => feature.label);
					if (disabled.length > 0) {
						yield* Console.log(
							`  Disabled features will fail with explicit errors until Plane enables them: ${disabled.join(", ")}`,
						);
					}

					writeLocalProjectContextSnapshot(projectHelper.right.snapshot);
					const helperPath = getLocalProjectContextFilePath();
					writeLocalProjectAgentsFile(projectHelper.right.snapshot);
					const agentsPath = getLocalAgentsFilePath();
					yield* Console.log(`\nProject helper saved to ${helperPath}`);
					yield* Console.log(
						`  States:    ${projectHelper.right.snapshot.helpers.states.total}`,
					);
					yield* Console.log(
						`  Labels:    ${projectHelper.right.snapshot.helpers.labels.total}`,
					);
					if (projectHelper.right.snapshot.helpers.estimate.enabled) {
						yield* Console.log(
							`  Estimate:  ${projectHelper.right.snapshot.helpers.estimate.name} (${projectHelper.right.snapshot.helpers.estimate.points.length} points)`,
						);
					} else {
						yield* Console.log("  Estimate:  disabled");
					}
					yield* Console.log(`Local AGENTS.md updated at ${agentsPath}`);

					const skillContent = readPackageSkillContent();
					if (skillContent) {
						const alreadyHasSkill = hasSkillSectionInAgentsFile();
						const skillPromptText = alreadyHasSkill
							? "Update SKILL.md (CLI usage guide) in AGENTS.md? [Y/n]: "
							: "Import SKILL.md (CLI usage guide) into AGENTS.md? [y/N]: ";
						const skillRl = readline.createInterface({
							input: process.stdin,
							output: process.stdout,
						});
						let skillAnswer: string;
						try {
							skillAnswer = yield* Effect.promise(() =>
								prompt(skillRl, skillPromptText),
							);
						} finally {
							skillRl.close();
						}
						const trimmed = skillAnswer.trim().toLowerCase();
						const shouldImport = alreadyHasSkill
							? trimmed !== "n" && trimmed !== "no"
							: trimmed === "y" || trimmed === "yes";
						if (shouldImport) {
							importSkillIntoAgentsFile(skillContent);
							yield* Console.log("  SKILL.md imported into AGENTS.md");
						}
					}
				} else {
					yield* Console.log(
						`\nWarning: could not load project helper data for ${selectedProject.identifier}: ${projectHelper.left.message}`,
					);
				}
			}
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
		"Interactive local setup. Saves overrides to ./.plane/config.json in the current directory, reports project feature flags, writes a local project helper snapshot for states, labels, and estimate points, updates AGENTS.md with project-context guidance for AI agents, and optionally imports the SKILL.md CLI usage guide into AGENTS.md.",
	),
);
