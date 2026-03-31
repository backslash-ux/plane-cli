import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	ModuleIssuesResponseSchema,
	ModuleSchema,
	ModulesResponseSchema,
} from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	findIssueBySeq,
	getMemberId,
	parseIssueRef,
	requireProjectFeature,
	resolveModule,
	resolveProject,
} from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ, WEB, OPS). Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

const moduleIdArg = Args.text({ name: "module-id" }).pipe(
	Args.withDescription("Module UUID (from 'plane modules list PROJECT')"),
);
const moduleArg = Args.text({ name: "module" }).pipe(
	Args.withDescription(
		"Module UUID or exact name (from 'plane modules list PROJECT')",
	),
);
const createNameOption = Options.text("name").pipe(
	Options.withDescription("Module name"),
);

const descriptionOption = Options.optional(Options.text("description")).pipe(
	Options.withDescription("Module description as plain text"),
);

const statusOption = Options.optional(
	Options.choice("status", [
		"backlog",
		"planned",
		"in-progress",
		"in_progress",
		"paused",
		"completed",
		"cancelled",
	]),
).pipe(
	Options.withDescription(
		"Module status: backlog, planned, in-progress, paused, completed, or cancelled",
	),
);

const startDateOption = Options.optional(Options.text("start-date")).pipe(
	Options.withDescription("Module start date in YYYY-MM-DD format"),
);

const targetDateOption = Options.optional(Options.text("target-date")).pipe(
	Options.withDescription("Module target date in YYYY-MM-DD format"),
);

const leadOption = Options.optional(Options.text("lead")).pipe(
	Options.withDescription(
		"Module lead (display name, email, or UUID from 'plane members list')",
	),
);

interface ModuleCreatePayload {
	name: string;
	description?: string;
	status?: string;
	start_date?: string;
	target_date?: string;
	lead?: string;
}

function normalizeModuleStatus(status: string): string {
	return status === "in_progress" ? "in-progress" : status;
}

function validateModuleDateInput(
	value: string,
	flagName: "--start-date" | "--target-date",
): Effect.Effect<string, Error> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return Effect.fail(
			new Error(`${flagName} must be a valid date in YYYY-MM-DD format`),
		);
	}

	const [year, month, day] = value.split("-").map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	const isValidDate =
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day;

	if (!isValidDate) {
		return Effect.fail(
			new Error(`${flagName} must be a valid date in YYYY-MM-DD format`),
		);
	}

	return Effect.succeed(value);
}

// --- modules list ---

export function modulesListHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "module_view");
		const raw = yield* api.get(`projects/${id}/modules/`);
		const { results } = yield* decodeOrFail(ModulesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No modules found");
			return;
		}
		const lines = results.map((m) => {
			const status = (m.status ?? "?").padEnd(12);
			return `${m.id}  ${status}  ${m.name}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const modulesList = Command.make(
	"list",
	{ project: listProjectArg },
	modulesListHandler,
).pipe(
	Command.withDescription(
		"List modules for a project. Shows module UUID, status, and name. Omit PROJECT to use the saved current project.\n\nExample:\n  plane modules list PROJ",
	),
);

// --- modules create ---

export function modulesCreateHandler({
	project,
	name,
	description,
	status,
	startDate,
	targetDate,
	lead,
}: {
	project: string;
	name: string;
	description: Option.Option<string>;
	status: Option.Option<string>;
	startDate: Option.Option<string>;
	targetDate: Option.Option<string>;
	lead: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "module_view");
		const body: ModuleCreatePayload = { name };
		if (Option.isSome(description)) {
			body.description = description.value;
		}
		if (Option.isSome(status)) {
			body.status = normalizeModuleStatus(status.value);
		}
		if (Option.isSome(startDate)) {
			body.start_date = yield* validateModuleDateInput(
				startDate.value,
				"--start-date",
			);
		}
		if (Option.isSome(targetDate)) {
			body.target_date = yield* validateModuleDateInput(
				targetDate.value,
				"--target-date",
			);
		}
		if (Option.isSome(lead)) {
			body.lead = yield* getMemberId(lead.value);
		}

		const raw = yield* api.post(`projects/${id}/modules/`, body);
		const module = yield* decodeOrFail(ModuleSchema, raw);
		yield* Console.log(`Created module: ${module.name} (${module.id})`);
	});
}

export const modulesCreate = Command.make(
	"create",
	{
		name: createNameOption,
		description: descriptionOption,
		status: statusOption,
		startDate: startDateOption,
		targetDate: targetDateOption,
		lead: leadOption,
		project: listProjectArg,
	},
	modulesCreateHandler,
).pipe(
	Command.withDescription(
		'Create a new module in a project. Omit PROJECT to use the saved current project.\n\nExamples:\n  plane modules create --name "Sprint 3"\n  plane modules create --name "Sprint 3" PROJ\n  plane modules create --name "Design System Rollout" --status planned PROJ\n  plane modules create --name "Mobile Launch" --lead "Jane Doe" --start-date 2026-04-01 --target-date 2026-04-30',
	),
);

// --- modules delete ---

export function modulesDeleteHandler({
	project,
	module,
}: {
	project: string;
	module: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "module_view");
		const resolvedModule = yield* resolveModule(id, module);
		yield* api.delete(`projects/${id}/modules/${resolvedModule.id}/`);
		yield* Console.log(
			`Deleted module: ${resolvedModule.name} (${resolvedModule.id})`,
		);
	});
}

export const modulesDelete = Command.make(
	"delete",
	{ project: projectArg, module: moduleArg },
	modulesDeleteHandler,
).pipe(
	Command.withDescription(
		`Delete a module by UUID or exact name.

Example:
  plane modules delete PROJ <module-id>`,
	),
);

// --- modules issues list ---

export function moduleIssuesListHandler({
	project,
	moduleId,
}: {
	project: string;
	moduleId: string;
}) {
	return Effect.gen(function* () {
		const { key, id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "module_view");
		const raw = yield* api.get(
			`projects/${id}/modules/${moduleId}/module-issues/`,
		);
		const { results } = yield* decodeOrFail(ModuleIssuesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No issues in module");
			return;
		}
		const lines = results.map((mi) => {
			if ("issue_detail" in mi && mi.issue_detail) {
				const seq = String(mi.issue_detail.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${mi.issue_detail.name}  (${mi.id})`;
			}
			if ("sequence_id" in mi) {
				const seq = String(mi.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${mi.name}  (${mi.id})`;
			}
			return `${mi.issue}  (module-issue: ${mi.id})`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const moduleIssuesList = Command.make(
	"list",
	{ project: projectArg, moduleId: moduleIdArg },
	moduleIssuesListHandler,
).pipe(
	Command.withDescription(
		"List issues in a module.\n\nExample:\n  plane modules issues list PROJ <module-id>",
	),
);

// --- modules issues add ---

const issueRefArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference to add (e.g. PROJ-29)"),
);

export function moduleIssuesAddHandler({
	project,
	moduleId,
	ref,
}: {
	project: string;
	moduleId: string;
	ref: string;
}) {
	return Effect.gen(function* () {
		const { id: projectId } = yield* resolveProject(project);
		yield* requireProjectFeature(projectId, "module_view");
		const { seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.post(
			`projects/${projectId}/modules/${moduleId}/module-issues/`,
			{
				issues: [issue.id],
			},
		);
		yield* Console.log(`Added ${ref} to module ${moduleId}`);
	});
}

export const moduleIssuesAdd = Command.make(
	"add",
	{ project: projectArg, moduleId: moduleIdArg, ref: issueRefArg },
	moduleIssuesAddHandler,
).pipe(
	Command.withDescription(
		"Add an issue to a module.\n\nExample:\n  plane modules issues add PROJ <module-id> PROJ-29",
	),
);

// --- modules issues remove ---

const moduleIssueIdArg = Args.text({ name: "module-issue-id" }).pipe(
	Args.withDescription(
		"Module issue identifier from 'plane modules issues list' (legacy join ID or live raw issue ID)",
	),
);

export function moduleIssuesRemoveHandler({
	project,
	moduleId,
	moduleIssueId,
}: {
	project: string;
	moduleId: string;
	moduleIssueId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "module_view");
		yield* api.delete(
			`projects/${id}/modules/${moduleId}/module-issues/${moduleIssueId}/`,
		);
		yield* Console.log(
			`Removed module-issue ${moduleIssueId} from module ${moduleId}`,
		);
	});
}

export const moduleIssuesRemove = Command.make(
	"remove",
	{
		project: projectArg,
		moduleId: moduleIdArg,
		moduleIssueId: moduleIssueIdArg,
	},
	moduleIssuesRemoveHandler,
).pipe(
	Command.withDescription(
		"Remove an issue from a module using the identifier returned by 'plane modules issues list'.\n\nExample:\n  plane modules issues remove PROJ <module-id> <module-issue-id>",
	),
);

// --- modules issues (parent) ---

export const moduleIssues = Command.make("issues").pipe(
	Command.withDescription(
		"Manage issues within a module. Subcommands: list, add, remove",
	),
	Command.withSubcommands([
		moduleIssuesList,
		moduleIssuesAdd,
		moduleIssuesRemove,
	]),
);

// --- modules (parent) ---

export const modules = Command.make("modules").pipe(
	Command.withDescription(
		'Manage modules (groups of related issues). Subcommands: list, create, delete, issues\n\nExamples:\n  plane modules list PROJ\n  plane modules create --name "Sprint 3"\n  plane modules delete PROJ <module-id>\n  plane modules issues list PROJ <module-id>\n  plane modules issues add PROJ <module-id> PROJ-29',
	),
	Command.withSubcommands([
		modulesList,
		modulesCreate,
		modulesDelete,
		moduleIssues,
	]),
);
