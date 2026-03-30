import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	ModuleIssuesResponseSchema,
	ModulesResponseSchema,
} from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	findIssueBySeq,
	parseIssueRef,
	requireProjectFeature,
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
			if (mi.issue_detail) {
				const seq = String(mi.issue_detail.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${mi.issue_detail.name}  (${mi.id})`;
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
		"Module-issue join ID (from 'plane modules issues list')",
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
		"Remove an issue from a module using the module-issue join ID.\n\nExample:\n  plane modules issues remove PROJ <module-id> <module-issue-id>",
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
		"Manage modules (groups of related issues). Subcommands: list, issues\n\nExamples:\n  plane modules list PROJ\n  plane modules issues list PROJ <module-id>\n  plane modules issues add PROJ <module-id> PROJ-29",
	),
	Command.withSubcommands([modulesList, moduleIssues]),
);
