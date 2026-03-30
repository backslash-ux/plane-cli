import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import { CycleIssuesResponseSchema, CyclesResponseSchema } from "../config.js";
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

const cycleIdArg = Args.text({ name: "cycle-id" }).pipe(
	Args.withDescription("Cycle UUID (from 'plane cycles list PROJECT')"),
);

// --- cycles list ---

export function cyclesListHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "cycle_view");
		const raw = yield* api.get(`projects/${id}/cycles/`);
		const { results } = yield* decodeOrFail(CyclesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No cycles found");
			return;
		}
		const lines = results.map((c) => {
			const start = c.start_date ?? "—";
			const end = c.end_date ?? "—";
			const status = (c.status ?? "?").padEnd(10);
			return `${c.id}  ${status}  ${start} → ${end}  ${c.name}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const cyclesList = Command.make(
	"list",
	{ project: listProjectArg },
	cyclesListHandler,
).pipe(
	Command.withDescription(
		"List cycles for a project. Shows cycle UUID, status, date range, and name. Omit PROJECT to use the saved current project.\n\nExample:\n  plane cycles list PROJ",
	),
);

// --- cycles issues list ---

export function cycleIssuesListHandler({
	project,
	cycleId,
}: {
	project: string;
	cycleId: string;
}) {
	return Effect.gen(function* () {
		const { key, id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "cycle_view");
		const raw = yield* api.get(
			`projects/${id}/cycles/${cycleId}/cycle-issues/`,
		);
		const { results } = yield* decodeOrFail(CycleIssuesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No issues in cycle");
			return;
		}
		const lines = results.map((ci) => {
			if (ci.issue_detail) {
				const seq = String(ci.issue_detail.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${ci.issue_detail.name}  (${ci.id})`;
			}
			return `${ci.issue}  (cycle-issue: ${ci.id})`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const cycleIssuesList = Command.make(
	"list",
	{ project: projectArg, cycleId: cycleIdArg },
	cycleIssuesListHandler,
).pipe(
	Command.withDescription(
		"List issues in a cycle.\n\nExample:\n  plane cycles issues list PROJ <cycle-id>",
	),
);

// --- cycles issues add ---

const issueRefArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference to add (e.g. PROJ-29)"),
);

export function cycleIssuesAddHandler({
	project,
	cycleId,
	ref,
}: {
	project: string;
	cycleId: string;
	ref: string;
}) {
	return Effect.gen(function* () {
		const { id: projectId } = yield* resolveProject(project);
		yield* requireProjectFeature(projectId, "cycle_view");
		const { seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.post(`projects/${projectId}/cycles/${cycleId}/cycle-issues/`, {
			issues: [issue.id],
		});
		yield* Console.log(`Added ${ref} to cycle ${cycleId}`);
	});
}

export const cycleIssuesAdd = Command.make(
	"add",
	{ project: projectArg, cycleId: cycleIdArg, ref: issueRefArg },
	cycleIssuesAddHandler,
).pipe(
	Command.withDescription(
		"Add an issue to a cycle.\n\nExample:\n  plane cycles issues add PROJ <cycle-id> PROJ-29",
	),
);

// --- cycles issues (parent) ---

export const cycleIssues = Command.make("issues").pipe(
	Command.withDescription(
		"Manage issues within a cycle. Subcommands: list, add",
	),
	Command.withSubcommands([cycleIssuesList, cycleIssuesAdd]),
);

// --- cycles (parent) ---

export const cycles = Command.make("cycles").pipe(
	Command.withDescription(
		"Manage cycles (sprints). Subcommands: list, issues\n\nExamples:\n  plane cycles list PROJ\n  plane cycles issues list PROJ <cycle-id>\n  plane cycles issues add PROJ <cycle-id> PROJ-29",
	),
	Command.withSubcommands([cyclesList, cycleIssues]),
);
