import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	CycleIssuesResponseSchema,
	CycleSchema,
	CyclesResponseSchema,
} from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	findIssueBySeq,
	parseIssueRef,
	requireProjectFeature,
	resolveCycle,
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

// --- shared options ---

const cycleNameOption = Options.text("name").pipe(
	Options.withDescription("Cycle name"),
);

const cycleStartDateOption = Options.optional(Options.text("start-date")).pipe(
	Options.withDescription("Cycle start date in YYYY-MM-DD format"),
);

const cycleEndDateOption = Options.optional(Options.text("end-date")).pipe(
	Options.withDescription("Cycle end date in YYYY-MM-DD format"),
);

const cycleArg = Args.text({ name: "cycle" }).pipe(
	Args.withDescription(
		"Cycle UUID or exact name (from 'plane cycles list PROJECT')",
	),
);

interface CyclePayload {
	name?: string;
	start_date?: string;
	end_date?: string;
	project_id?: string;
}

function validateCycleDateInput(
	value: string,
	flagName: string,
): Effect.Effect<string, Error> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return Effect.fail(
			new Error(`${flagName} must be a valid date in YYYY-MM-DD format`),
		);
	}
	const [year, month, day] = value.split("-").map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	const isValid =
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day;
	if (!isValid) {
		return Effect.fail(
			new Error(`${flagName} must be a valid date in YYYY-MM-DD format`),
		);
	}
	return Effect.succeed(value);
}

function computeCycleStatus(
	startDate: string | null | undefined,
	endDate: string | null | undefined,
): string {
	if (!startDate || !endDate) return "draft";
	const now = new Date();
	const today = new Date(
		Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
	);
	const start = new Date(`${startDate}T00:00:00Z`);
	const end = new Date(`${endDate}T00:00:00Z`);
	if (today < start) return "upcoming";
	if (today > end) return "completed";
	return "current";
}

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
			const status = (
				c.status ?? computeCycleStatus(c.start_date, c.end_date)
			).padEnd(10);
			const total = c.total_issues ?? 0;
			const done = c.completed_issues ?? 0;
			const stats = `[${done}/${total}]`.padEnd(8);
			return `${c.id}  ${status}  ${stats}  ${start} → ${end}  ${c.name}`;
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
		"List cycles for a project. Shows cycle UUID, status, progress, date range, and name. Omit PROJECT to use the saved current project.\n\nExample:\n  plane cycles list PROJ",
	),
);

// --- cycles create ---

export function cyclesCreateHandler({
	project,
	name,
	startDate,
	endDate,
}: {
	project: string;
	name: string;
	startDate: Option.Option<string>;
	endDate: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "cycle_view");
		const body: CyclePayload = { name, project_id: id };
		if (Option.isSome(startDate)) {
			body.start_date = yield* validateCycleDateInput(
				startDate.value,
				"--start-date",
			);
		}
		if (Option.isSome(endDate)) {
			body.end_date = yield* validateCycleDateInput(
				endDate.value,
				"--end-date",
			);
		}
		const raw = yield* api.post(`projects/${id}/cycles/`, body);
		const cycle = yield* decodeOrFail(CycleSchema, raw);
		yield* Console.log(`Created cycle: ${cycle.name} (${cycle.id})`);
	});
}

export const cyclesCreate = Command.make(
	"create",
	{
		name: cycleNameOption,
		startDate: cycleStartDateOption,
		endDate: cycleEndDateOption,
		project: listProjectArg,
	},
	cyclesCreateHandler,
).pipe(
	Command.withDescription(
		'Create a new cycle in a project. Omit PROJECT to use the saved current project.\n\nExamples:\n  plane cycles create --name "Sprint 5"\n  plane cycles create --name "Sprint 5" --start-date 2025-04-01 --end-date 2025-04-14 PROJ',
	),
);

// --- cycles update ---

const cycleUpdateNameOption = Options.optional(Options.text("name")).pipe(
	Options.withDescription("New cycle name"),
);

export function cyclesUpdateHandler({
	project,
	cycle,
	name,
	startDate,
	endDate,
}: {
	project: string;
	cycle: string;
	name: Option.Option<string>;
	startDate: Option.Option<string>;
	endDate: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "cycle_view");
		const resolved = yield* resolveCycle(id, cycle);
		const body: CyclePayload = {};
		if (Option.isSome(name)) body.name = name.value;
		if (Option.isSome(startDate)) {
			body.start_date = yield* validateCycleDateInput(
				startDate.value,
				"--start-date",
			);
		}
		if (Option.isSome(endDate)) {
			body.end_date = yield* validateCycleDateInput(
				endDate.value,
				"--end-date",
			);
		}
		if (Object.keys(body).length === 0) {
			yield* Console.log("Nothing to update");
			return;
		}
		yield* api.patch(`projects/${id}/cycles/${resolved.id}/`, body);
		yield* Console.log(`Updated cycle: ${resolved.name} (${resolved.id})`);
	});
}

export const cyclesUpdate = Command.make(
	"update",
	{
		name: cycleUpdateNameOption,
		startDate: cycleStartDateOption,
		endDate: cycleEndDateOption,
		project: projectArg,
		cycle: cycleArg,
	},
	cyclesUpdateHandler,
).pipe(
	Command.withDescription(
		'Update a cycle by UUID or exact name.\n\nExamples:\n  plane cycles update --name "Sprint 5b" PROJ "Sprint 5"\n  plane cycles update --end-date 2025-04-15 PROJ <cycle-id>',
	),
);

// --- cycles delete ---

export function cyclesDeleteHandler({
	project,
	cycle,
}: {
	project: string;
	cycle: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "cycle_view");
		const resolved = yield* resolveCycle(id, cycle);
		yield* api.delete(`projects/${id}/cycles/${resolved.id}/`);
		yield* Console.log(`Deleted cycle: ${resolved.name} (${resolved.id})`);
	});
}

export const cyclesDelete = Command.make(
	"delete",
	{ project: projectArg, cycle: cycleArg },
	cyclesDeleteHandler,
).pipe(
	Command.withDescription(
		"Delete a cycle by UUID or exact name.\n\nExample:\n  plane cycles delete PROJ <cycle-id>",
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
			if ("sequence_id" in ci) {
				const seq = String(ci.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${ci.name}`;
			}
			if (ci.issue_detail) {
				const seq = String(ci.issue_detail.sequence_id).padStart(3, " ");
				return `${key}-${seq}  ${ci.issue_detail.name}`;
			}
			return `${ci.issue}`;
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
		'Manage cycles (sprints). Subcommands: list, create, update, delete, issues\n\nExamples:\n  plane cycles list PROJ\n  plane cycles create --name "Sprint 5" --start-date 2025-04-01 --end-date 2025-04-14\n  plane cycles update --name "Sprint 5b" PROJ "Sprint 5"\n  plane cycles delete PROJ <cycle-id>\n  plane cycles issues list PROJ <cycle-id>\n  plane cycles issues add PROJ <cycle-id> PROJ-29',
	),
	Command.withSubcommands([
		cyclesList,
		cyclesCreate,
		cyclesUpdate,
		cyclesDelete,
		cycleIssues,
	]),
);
