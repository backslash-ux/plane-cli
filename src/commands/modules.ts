import { Command, Args } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	ModulesResponseSchema,
	ModuleIssuesResponseSchema,
} from "../config.js";
import { resolveProject, parseIssueRef, findIssueBySeq } from "../resolve.js";
import { jsonMode, xmlMode, toXml } from "../output.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription("Project identifier (e.g. PROJ, WEB, OPS)"),
);

const moduleIdArg = Args.text({ name: "module-id" }).pipe(
	Args.withDescription("Module UUID (from 'plane modules list PROJECT')"),
);

// --- modules list ---

export const modulesList = Command.make(
	"list",
	{ project: projectArg },
	({ project }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
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
		}),
).pipe(
	Command.withDescription(
		"List modules for a project. Shows module UUID, status, and name.\n\nExample:\n  plane modules list PROJ",
	),
);

// --- modules issues list ---

export const moduleIssuesList = Command.make(
	"list",
	{ project: projectArg, moduleId: moduleIdArg },
	({ project, moduleId }) =>
		Effect.gen(function* () {
			const { key, id } = yield* resolveProject(project);
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
		}),
).pipe(
	Command.withDescription(
		"List issues in a module.\n\nExample:\n  plane modules issues list PROJ <module-id>",
	),
);

// --- modules issues add ---

const issueRefArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference to add (e.g. PROJ-29)"),
);

export const moduleIssuesAdd = Command.make(
	"add",
	{ project: projectArg, moduleId: moduleIdArg, ref: issueRefArg },
	({ project, moduleId, ref }) =>
		Effect.gen(function* () {
			const { id: projectId } = yield* resolveProject(project);
			const { seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			yield* api.post(
				`projects/${projectId}/modules/${moduleId}/module-issues/`,
				{
					issues: [issue.id],
				},
			);
			yield* Console.log(`Added ${ref} to module ${moduleId}`);
		}),
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

export const moduleIssuesRemove = Command.make(
	"remove",
	{
		project: projectArg,
		moduleId: moduleIdArg,
		moduleIssueId: moduleIssueIdArg,
	},
	({ project, moduleId, moduleIssueId }) =>
		Effect.gen(function* () {
			const { id } = yield* resolveProject(project);
			yield* api.delete(
				`projects/${id}/modules/${moduleId}/module-issues/${moduleIssueId}/`,
			);
			yield* Console.log(
				`Removed module-issue ${moduleIssueId} from module ${moduleId}`,
			);
		}),
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
