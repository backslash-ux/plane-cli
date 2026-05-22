import { readFile } from "node:fs/promises";
import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	EstimatePointsResponseSchema,
	EstimateSchema,
	type Issue,
	IssueSchema,
	IssuesResponseSchema,
	ProjectDetailSchema,
} from "../config.js";
import type {
	IssueCreatePayload,
	IssueUpdatePayload,
} from "../issue-support.js";
import {
	issueMutationResult,
	jsonMode,
	jsonOption,
	normalizeIssueForJson,
} from "../output.js";
import {
	findIssueBySeq,
	getLabelId,
	getMemberId,
	getStateId,
	parseIssueRef,
	requireProjectFeature,
	resolveCycle,
	resolveModule,
	resolveProject,
} from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier. Omit to use the saved current project.",
	),
	Args.withDefault(""),
);

const fileOption = Options.text("file").pipe(
	Options.withDescription("JSON file containing an array of issue records"),
);
const dryRunOption = Options.boolean("dry-run").pipe(
	Options.withDescription(
		"Validate and report planned actions without mutating Plane",
	),
	Options.withDefault(false),
);
const dedupeOption = Options.optional(Options.text("dedupe")).pipe(
	Options.withDescription(
		"Report possible duplicates: title, similarity, or title,similarity",
	),
);
const stateOption = Options.optional(Options.text("state")).pipe(
	Options.withDescription("Default state group or name"),
);
const priorityOption = Options.optional(
	Options.choice("priority", ["urgent", "high", "medium", "low", "none"]),
).pipe(Options.withDescription("Default issue priority"));
const assigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription("Default assignee display name, email, or UUID"),
);
const labelOption = Options.repeated(Options.text("label")).pipe(
	Options.withDescription("Default label name(s), repeatable"),
);
const startDateOption = Options.optional(Options.text("start-date")).pipe(
	Options.withDescription("Default start date (YYYY-MM-DD)"),
);
const targetDateOption = Options.optional(
	Options.text("target-date").pipe(Options.withAlias("due-date")),
).pipe(Options.withDescription("Default target/due date (YYYY-MM-DD)"));
const estimateOption = Options.optional(Options.text("estimate")).pipe(
	Options.withDescription("Default estimate point UUID"),
);
const cycleOption = Options.optional(Options.text("cycle")).pipe(
	Options.withDescription("Default cycle name or UUID"),
);
const moduleOption = Options.optional(Options.text("module")).pipe(
	Options.withDescription("Default module name or UUID"),
);

type BulkRecord = Record<string, unknown>;

interface SharedOptions {
	state: Option.Option<string>;
	priority: Option.Option<string>;
	assignee: Option.Option<string>;
	label: string[];
	startDate: Option.Option<string>;
	targetDate: Option.Option<string>;
	estimate: Option.Option<string>;
	cycle: Option.Option<string>;
	module: Option.Option<string>;
}

interface PlannedResult {
	index: number;
	title?: string;
	ref?: string;
	action:
		| "would_create"
		| "would_update"
		| "created"
		| "updated"
		| "invalid"
		| "possible_duplicate";
	errors?: string[];
	candidates?: unknown[];
	payload?: IssueCreatePayload | IssueUpdatePayload;
	result?: unknown;
}

export function issuesBulkCreateHandler({
	project,
	file,
	dryRun,
	dedupe,
	...shared
}: SharedOptions & {
	project: string;
	file: string;
	dryRun: boolean;
	dedupe: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const records = yield* readBulkFile(file);
		const { key, id: projectId } = yield* resolveProject(project);
		const existing = yield* loadIssues(projectId);
		const results: PlannedResult[] = [];
		for (let index = 0; index < records.length; index += 1) {
			const record = records[index] ?? {};
			const title = stringField(record, "title") ?? stringField(record, "name");
			if (!title) {
				results.push({
					index,
					action: "invalid",
					errors: ["title is required"],
				});
				continue;
			}
			const candidates = Option.isSome(dedupe)
				? duplicateCandidates(key, existing, title, dedupe.value)
				: [];
			if (candidates.length > 0) {
				results.push({
					index,
					title,
					action: "possible_duplicate",
					candidates,
				});
				continue;
			}
			const planned = yield* buildCreatePayload(
				projectId,
				title,
				record,
				shared,
			);
			if (planned._tag === "Left") {
				results.push({ index, title, action: "invalid", errors: planned.left });
				continue;
			}
			if (dryRun) {
				results.push({
					index,
					title,
					action: "would_create",
					payload: planned.right.body,
				});
				continue;
			}
			const raw = yield* api.post(
				`projects/${projectId}/issues/`,
				planned.right.body,
			);
			const created = yield* decodeOrFail(IssueSchema, raw);
			yield* attachCycleAndModule(
				projectId,
				created.id,
				planned.right.cycle,
				planned.right.module,
			);
			const resultIssue = jsonMode
				? yield* decodeOrFail(
						IssueSchema,
						yield* api.get(`projects/${projectId}/issues/${created.id}/`),
					)
				: created;
			results.push({
				index,
				title,
				action: "created",
				result: issueMutationResult({
					action: "created",
					projectKey: key,
					issue: resultIssue,
				}),
			});
		}
		yield* outputBulkResults(results);
	});
}

export function issuesBulkUpdateHandler({
	file,
	dryRun,
	...shared
}: SharedOptions & {
	project: string;
	file: string;
	dryRun: boolean;
}) {
	return Effect.gen(function* () {
		const records = yield* readBulkFile(file);
		const results: PlannedResult[] = [];
		for (let index = 0; index < records.length; index += 1) {
			const record = records[index] ?? {};
			const ref = stringField(record, "ref");
			if (!ref) {
				results.push({ index, action: "invalid", errors: ["ref is required"] });
				continue;
			}
			const parsedRef = yield* Effect.either(parseIssueRef(ref));
			if (parsedRef._tag === "Left") {
				results.push({
					index,
					ref,
					action: "invalid",
					errors: [parsedRef.left.message],
				});
				continue;
			}
			const { projectId, projKey, seq } = parsedRef.right;
			const issue = yield* findIssueBySeq(projectId, seq);
			const planned = yield* buildUpdatePayload(projectId, record, shared);
			if (planned._tag === "Left") {
				results.push({ index, ref, action: "invalid", errors: planned.left });
				continue;
			}
			if (
				Object.keys(planned.right.body).length === 0 &&
				!planned.right.cycle &&
				!planned.right.module
			) {
				results.push({
					index,
					ref,
					action: "invalid",
					errors: ["no update fields provided"],
				});
				continue;
			}
			if (dryRun) {
				results.push({
					index,
					ref,
					action: "would_update",
					payload: planned.right.body,
				});
				continue;
			}
			let updated = issue;
			if (Object.keys(planned.right.body).length > 0) {
				const raw = yield* api.patch(
					`projects/${projectId}/issues/${issue.id}/`,
					planned.right.body,
				);
				updated = yield* decodeOrFail(IssueSchema, raw);
			}
			yield* attachCycleAndModule(
				projectId,
				issue.id,
				planned.right.cycle,
				planned.right.module,
			);
			const refreshed = yield* decodeOrFail(
				IssueSchema,
				yield* api.get(`projects/${projectId}/issues/${issue.id}/`),
			);
			results.push({
				index,
				ref,
				action: "updated",
				result: issueMutationResult({
					action: "updated",
					projectKey: projKey,
					issue: refreshed ?? updated,
				}),
			});
		}
		yield* outputBulkResults(results);
	});
}

export const issuesBulkCreate = Command.make(
	"bulk-create",
	{
		file: fileOption,
		dryRun: dryRunOption,
		dedupe: dedupeOption,
		state: stateOption,
		priority: priorityOption,
		assignee: assigneeOption,
		label: labelOption,
		startDate: startDateOption,
		targetDate: targetDateOption,
		estimate: estimateOption,
		cycle: cycleOption,
		module: moduleOption,
		json: jsonOption,
		project: projectArg,
	},
	issuesBulkCreateHandler,
).pipe(
	Command.withDescription(
		"Create many issues from a JSON array. Use --dry-run to validate state, labels, priority, cycle/module, estimate, descriptions, and duplicate candidates before creating.",
	),
);

export const issuesBulkUpdate = Command.make(
	"bulk-update",
	{
		file: fileOption,
		dryRun: dryRunOption,
		state: stateOption,
		priority: priorityOption,
		assignee: assigneeOption,
		label: labelOption,
		startDate: startDateOption,
		targetDate: targetDateOption,
		estimate: estimateOption,
		cycle: cycleOption,
		module: moduleOption,
		json: jsonOption,
		project: projectArg,
	},
	issuesBulkUpdateHandler,
).pipe(
	Command.withDescription(
		"Update many issues from a JSON array. Each record must include ref, e.g. PROJ-29. Use --dry-run to validate without mutating Plane.",
	),
);

function readBulkFile(file: string): Effect.Effect<BulkRecord[], Error> {
	return Effect.tryPromise({
		try: async () => {
			const parsed = JSON.parse(await readFile(file, "utf8"));
			if (!Array.isArray(parsed)) {
				throw new Error("--file must contain a JSON array");
			}
			return parsed as BulkRecord[];
		},
		catch: (error) =>
			error instanceof Error ? error : new Error(String(error)),
	});
}

function loadIssues(projectId: string): Effect.Effect<readonly Issue[], Error> {
	return Effect.gen(function* () {
		const raw = yield* api.get(
			`projects/${projectId}/issues/?order_by=sequence_id`,
		);
		const { results } = yield* decodeOrFail(IssuesResponseSchema, raw);
		return results;
	});
}

function buildCreatePayload(
	projectId: string,
	title: string,
	record: BulkRecord,
	shared: SharedOptions,
) {
	return Effect.either(
		Effect.gen(function* () {
			const body: IssueCreatePayload = { name: title };
			const refs = yield* applySharedIssueFields(
				projectId,
				body,
				record,
				shared,
			);
			return { body, ...refs };
		}),
	).pipe(Effect.map((result) => mapPlanningError(result)));
}

function buildUpdatePayload(
	projectId: string,
	record: BulkRecord,
	shared: SharedOptions,
) {
	return Effect.either(
		Effect.gen(function* () {
			const body: IssueUpdatePayload = {};
			const title = stringField(record, "title") ?? stringField(record, "name");
			if (title) body.name = title;
			const refs = yield* applySharedIssueFields(
				projectId,
				body,
				record,
				shared,
			);
			return { body, ...refs };
		}),
	).pipe(Effect.map((result) => mapPlanningError(result)));
}

function mapPlanningError<A>(
	result: { _tag: "Left"; left: Error } | { _tag: "Right"; right: A },
) {
	if (result._tag === "Left")
		return { _tag: "Left" as const, left: [result.left.message] };
	return result;
}

function applySharedIssueFields(
	projectId: string,
	body: IssueCreatePayload | IssueUpdatePayload,
	record: BulkRecord,
	shared: SharedOptions,
) {
	return Effect.gen(function* () {
		const priority =
			stringField(record, "priority") ?? optionValue(shared.priority);
		if (priority) body.priority = yield* validatePriority(priority);
		const state = stringField(record, "state") ?? optionValue(shared.state);
		if (state) body.state = yield* getStateId(projectId, state);
		const description =
			stringField(record, "description_html") ??
			stringField(record, "description");
		if (description) {
			yield* validateDescription(description);
			body.description_html = description;
		}
		const assignee =
			stringField(record, "assignee") ?? optionValue(shared.assignee);
		if (assignee) body.assignees = [yield* getMemberId(assignee)];
		const labels = [
			...shared.label,
			...stringArrayField(record, "labels"),
			...stringArrayField(record, "label"),
		];
		if (labels.length > 0) {
			body.labels = [];
			for (const label of labels)
				body.labels.push(yield* getLabelId(projectId, label));
		}
		const startDate =
			stringField(record, "start_date") ??
			stringField(record, "startDate") ??
			optionValue(shared.startDate);
		if (startDate)
			body.start_date = yield* validateDate(startDate, "start_date");
		const targetDate =
			stringField(record, "target_date") ??
			stringField(record, "targetDate") ??
			stringField(record, "due_date") ??
			optionValue(shared.targetDate);
		if (targetDate)
			body.target_date = yield* validateDate(targetDate, "target_date");
		const estimate =
			stringField(record, "estimate") ??
			stringField(record, "estimate_point") ??
			optionValue(shared.estimate);
		if (estimate) {
			yield* validateEstimate(projectId, estimate);
			body.estimate_point = estimate;
		}
		const cycle = stringField(record, "cycle") ?? optionValue(shared.cycle);
		const module = stringField(record, "module") ?? optionValue(shared.module);
		if (cycle) {
			yield* requireProjectFeature(projectId, "cycle_view");
			yield* resolveCycle(projectId, cycle);
		}
		if (module) {
			yield* requireProjectFeature(projectId, "module_view");
			yield* resolveModule(projectId, module);
		}
		return { cycle, module };
	});
}

function attachCycleAndModule(
	projectId: string,
	issueId: string,
	cycle?: string,
	module?: string,
) {
	return Effect.gen(function* () {
		if (cycle) {
			const resolved = yield* resolveCycle(projectId, cycle);
			yield* api.post(
				`projects/${projectId}/cycles/${resolved.id}/cycle-issues/`,
				{ issues: [issueId] },
			);
		}
		if (module) {
			const resolved = yield* resolveModule(projectId, module);
			yield* api.post(
				`projects/${projectId}/modules/${resolved.id}/module-issues/`,
				{ issues: [issueId] },
			);
		}
	});
}

function validateEstimate(projectId: string, estimatePoint: string) {
	return Effect.gen(function* () {
		const detail = yield* decodeOrFail(
			ProjectDetailSchema,
			yield* api.get(`projects/${projectId}/`),
		);
		if (!detail.estimate)
			return yield* Effect.fail(new Error("Project estimates are disabled"));
		const estimate = yield* decodeOrFail(
			EstimateSchema,
			yield* api.get(`projects/${projectId}/estimates/`),
		);
		const points = yield* decodeOrFail(
			EstimatePointsResponseSchema,
			yield* api.get(
				`projects/${projectId}/estimates/${estimate.id}/estimate-points/`,
			),
		);
		if (
			!points.some(
				(point) =>
					point.id === estimatePoint ||
					point.value.toLowerCase() === estimatePoint.toLowerCase(),
			)
		) {
			return yield* Effect.fail(
				new Error(`Estimate point not found: ${estimatePoint}`),
			);
		}
	});
}

function outputBulkResults(results: PlannedResult[]) {
	return Effect.gen(function* () {
		if (jsonMode) {
			yield* Console.log(JSON.stringify({ results }, null, 2));
			return;
		}
		yield* Console.log(
			results
				.map((result) => {
					const subject =
						result.ref ?? result.title ?? `item ${result.index + 1}`;
					if (result.errors?.length)
						return `${result.action} ${subject}: ${result.errors.join("; ")}`;
					return `${result.action} ${subject}`;
				})
				.join("\n"),
		);
	});
}

function duplicateCandidates(
	projectKey: string,
	issues: readonly Issue[],
	title: string,
	modes: string,
) {
	const parsedModes = new Set(
		modes.split(",").map((mode) => mode.trim().toLowerCase()),
	);
	if (!parsedModes.has("title") && !parsedModes.has("similarity"))
		parsedModes.add("title");
	const requestedTitle = normalizeTitle(title);
	return issues
		.map((issue) => {
			const exact =
				parsedModes.has("title") &&
				normalizeTitle(issue.name) === requestedTitle;
			const similarity = titleSimilarity(title, issue.name);
			const similar = parsedModes.has("similarity") && similarity >= 0.9;
			if (!exact && !similar) return null;
			return {
				ref: `${projectKey}-${issue.sequence_id}`,
				title: issue.name,
				match: exact ? "title" : "similarity",
				similarity,
				issue: normalizeIssueForJson(projectKey, issue),
			};
		})
		.filter(
			(candidate): candidate is NonNullable<typeof candidate> =>
				candidate !== null,
		);
}

function validatePriority(priority: string): Effect.Effect<string, Error> {
	if (!["urgent", "high", "medium", "low", "none"].includes(priority)) {
		return Effect.fail(new Error(`Invalid priority: ${priority}`));
	}
	return Effect.succeed(priority);
}

function validateDate(
	value: string,
	field: string,
): Effect.Effect<string, Error> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return Effect.fail(new Error(`${field} must be YYYY-MM-DD`));
	}
	return Effect.succeed(value);
}

function validateDescription(value: string): Effect.Effect<void, Error> {
	if (
		(value.includes("<") && !value.includes(">")) ||
		(value.includes(">") && !value.includes("<"))
	) {
		return Effect.fail(new Error("description HTML appears malformed"));
	}
	return Effect.succeed(void 0);
}

function titleSimilarity(left: string, right: string): number {
	const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
	const rightTokens = new Set(normalizeTitle(right).split(" ").filter(Boolean));
	const union = new Set([...leftTokens, ...rightTokens]);
	if (union.size === 0) return 0;
	let intersection = 0;
	for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
	return intersection / union.size;
}

function normalizeTitle(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function stringField(record: BulkRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayField(record: BulkRecord, key: string): string[] {
	const value = record[key];
	if (typeof value === "string" && value.trim()) return [value];
	if (Array.isArray(value))
		return value.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		);
	return [];
}

function optionValue(option: Option.Option<string>): string | undefined {
	return Option.isSome(option) ? option.value : undefined;
}
