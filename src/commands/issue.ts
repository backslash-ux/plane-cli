import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import { ActivitiesResponseSchema, IssueSchema } from "../config.js";
import { escapeHtmlText } from "../format.js";
import type {
	IssueCreatePayload,
	IssueUpdatePayload,
} from "../issue-support.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
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
import { issueComments, issueLink, issueWorklogs } from "./issue-sub.js";

export {
	issueCommentDeleteHandler,
	issueComments,
	issueCommentsListHandler,
	issueCommentUpdateHandler,
	issueLink,
	issueLinkAddHandler,
	issueLinkListHandler,
	issueLinkRemoveHandler,
	issueWorklogs,
	issueWorklogsAddHandler,
	issueWorklogsListHandler,
} from "./issue-sub.js";

const refArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference, e.g. PROJ-29"),
);
// --- issue get ---
export function issueGetHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* Console.log(JSON.stringify(issue, null, 2));
	});
}

export const issueGet = Command.make(
	"get",
	{ ref: refArg },
	issueGetHandler,
).pipe(
	Command.withDescription(
		"Print full JSON for an issue. Useful for inspecting all fields (state, priority, assignees, labels, etc.).",
	),
);
// --- issue update ---
const stateOption = Options.optional(Options.text("state")).pipe(
	Options.withDescription("State group or name (e.g. backlog, completed)"),
);

const priorityOption = Options.optional(
	Options.choice("priority", ["urgent", "high", "medium", "low", "none"]),
).pipe(Options.withDescription("Issue priority"));

const titleUpdateOption = Options.optional(Options.text("title")).pipe(
	Options.withDescription("Issue title"),
);

const descriptionOption = Options.optional(Options.text("description")).pipe(
	Options.withDescription("Issue description as HTML (e.g. '<p>Details</p>')"),
);

const assigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription("Assign to a member (display name, email, or UUID)"),
);

const labelOption = Options.repeated(Options.text("label")).pipe(
	Options.withDescription("Set issue label(s) by name (repeatable)"),
);

const noAssigneeOption = Options.boolean("no-assignee").pipe(
	Options.withDescription("Clear all assignees"),
	Options.withDefault(false),
);

const startDateOption = Options.optional(Options.text("start-date")).pipe(
	Options.withDescription("Start date (YYYY-MM-DD)"),
);

const targetDateOption = Options.optional(
	Options.text("target-date").pipe(Options.withAlias("due-date")),
).pipe(Options.withDescription("Target/due date (YYYY-MM-DD)"));

const estimateOption = Options.optional(Options.text("estimate")).pipe(
	Options.withDescription(
		"Estimate point UUID (from project estimate settings)",
	),
);

const cycleOption = Options.optional(Options.text("cycle")).pipe(
	Options.withDescription("Assign to a cycle (name or UUID)"),
);

const moduleOption = Options.optional(Options.text("module")).pipe(
	Options.withDescription("Assign to a module (name or UUID)"),
);

export function issueUpdateHandler({
	ref,
	state,
	priority,
	title,
	description,
	assignee,
	label,
	noAssignee,
	startDate,
	targetDate,
	estimate,
	cycle,
	module: mod,
}: {
	ref: string;
	state: Option.Option<string>;
	priority: Option.Option<string>;
	title: Option.Option<string>;
	description: Option.Option<string>;
	assignee: Option.Option<string>;
	label: Array<string>;
	noAssignee: boolean;
	startDate: Option.Option<string>;
	targetDate: Option.Option<string>;
	estimate: Option.Option<string>;
	cycle: Option.Option<string>;
	module: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);

		const body: IssueUpdatePayload = {};

		if (Option.isSome(state)) {
			body.state = yield* getStateId(projectId, state.value);
		}
		if (Option.isSome(priority)) {
			body.priority = priority.value;
		}
		if (Option.isSome(title)) {
			body.name = title.value;
		}
		if (Option.isSome(description)) {
			body.description_html = description.value;
		}
		if (noAssignee) {
			body.assignees = [];
		} else if (Option.isSome(assignee)) {
			const memberId = yield* getMemberId(assignee.value);
			body.assignees = [memberId];
		}
		if (label.length > 0) {
			const labelIds: string[] = [];
			for (const l of label) {
				labelIds.push(yield* getLabelId(projectId, l));
			}
			body.labels = labelIds;
		}
		if (Option.isSome(startDate)) {
			body.start_date = startDate.value;
		}
		if (Option.isSome(targetDate)) {
			body.target_date = targetDate.value;
		}
		if (Option.isSome(estimate)) {
			body.estimate_point = estimate.value;
		}

		const hasCycle = Option.isSome(cycle);
		const hasModule = Option.isSome(mod);

		if (Object.keys(body).length === 0 && !hasCycle && !hasModule) {
			yield* Effect.fail(
				new Error(
					"Nothing to update. Specify --state, --priority, --title, --description, --assignee, --label, --no-assignee, --start-date, --target-date, --estimate, --cycle, or --module",
				),
			);
		}

		if (Object.keys(body).length > 0) {
			const raw = yield* api.patch(
				`projects/${projectId}/issues/${issue.id}/`,
				body,
			);
			yield* decodeOrFail(IssueSchema, raw);
		}

		if (hasCycle) {
			yield* requireProjectFeature(projectId, "cycle_view");
			const resolved = yield* resolveCycle(projectId, cycle.value);
			yield* api.post(
				`projects/${projectId}/cycles/${resolved.id}/cycle-issues/`,
				{ issues: [issue.id] },
			);
		}

		if (hasModule) {
			yield* requireProjectFeature(projectId, "module_view");
			const resolved = yield* resolveModule(projectId, mod.value);
			yield* api.post(
				`projects/${projectId}/modules/${resolved.id}/module-issues/`,
				{ issues: [issue.id] },
			);
		}

		const refreshedRaw = yield* api.get(
			`projects/${projectId}/issues/${issue.id}/`,
		);
		const updated = yield* decodeOrFail(IssueSchema, refreshedRaw);
		const stateName =
			typeof updated.state === "object" ? updated.state.name : updated.state;
		yield* Console.log(
			`Updated ${ref}: state=${stateName} priority=${updated.priority}`,
		);
	});
}

export const issueUpdate = Command.make(
	"update",
	{
		state: stateOption,
		priority: priorityOption,
		title: titleUpdateOption,
		description: descriptionOption,
		assignee: assigneeOption,
		label: labelOption,
		noAssignee: noAssigneeOption,
		startDate: startDateOption,
		targetDate: targetDateOption,
		estimate: estimateOption,
		cycle: cycleOption,
		module: moduleOption,
		ref: refArg,
	},
	issueUpdateHandler,
).pipe(
	Command.withDescription(
		'Update an issue\'s state, priority, title, description, assignee, labels, dates, estimate, cycle, or module.\n\nExamples:\n  plane issue update --state completed PROJ-29\n  plane issue update --priority high WEB-5\n  plane issue update --start-date 2026-04-01 --target-date 2026-04-15 PROJ-29\n  plane issue update --label bug --label urgent PROJ-29\n  plane issue update --cycle "Sprint 3" PROJ-29\n  plane issue update --module "Backend" PROJ-29\n  plane issue update --estimate <UUID> PROJ-29',
	),
);
// --- issue comment ---
const textArg = Args.text({ name: "text" }).pipe(
	Args.withDescription("Comment text to add"),
);

export function issueCommentHandler({
	ref,
	text,
}: {
	ref: string;
	text: string;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const escaped = escapeHtmlText(text);
		yield* api.post(`projects/${projectId}/issues/${issue.id}/comments/`, {
			comment_html: `<p>${escaped}</p>`,
		});
		yield* Console.log(`Comment added to ${ref}`);
	});
}

export const issueComment = Command.make(
	"comment",
	{ ref: refArg, text: textArg },
	issueCommentHandler,
).pipe(
	Command.withDescription(
		'Add a comment to an issue. The text is wrapped in <p> tags and HTML-escaped.\n\nExample:\n  plane issue comment PROJ-29 "Fixed in latest build"',
	),
);
// --- issue create ---
const createTitleOption = Options.text("title").pipe(
	Options.withDescription("Issue title"),
);
const createProjectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ). Omit to use the saved current project.",
	),
	Args.withDefault(""),
);

const createPriorityOption = Options.optional(
	Options.choice("priority", ["urgent", "high", "medium", "low", "none"]),
).pipe(Options.withDescription("Issue priority"));

const createStateOption = Options.optional(Options.text("state")).pipe(
	Options.withDescription("Initial state group or name"),
);

const createDescriptionOption = Options.optional(
	Options.text("description"),
).pipe(
	Options.withDescription("Issue description as HTML (e.g. '<p>Details</p>')"),
);

const createAssigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription("Assign to a member (display name, email, or UUID)"),
);

const createLabelOption = Options.repeated(Options.text("label")).pipe(
	Options.withDescription("Set issue label(s) by name (repeatable)"),
);

const createStartDateOption = Options.optional(Options.text("start-date")).pipe(
	Options.withDescription("Start date (YYYY-MM-DD)"),
);

const createTargetDateOption = Options.optional(
	Options.text("target-date").pipe(Options.withAlias("due-date")),
).pipe(Options.withDescription("Target/due date (YYYY-MM-DD)"));

const createEstimateOption = Options.optional(Options.text("estimate")).pipe(
	Options.withDescription(
		"Estimate point UUID (from project estimate settings)",
	),
);

const createCycleOption = Options.optional(Options.text("cycle")).pipe(
	Options.withDescription("Assign to a cycle (name or UUID)"),
);

const createModuleOption = Options.optional(Options.text("module")).pipe(
	Options.withDescription("Assign to a module (name or UUID)"),
);

export function issueCreateHandler({
	project,
	title,
	priority,
	state,
	description,
	assignee,
	label,
	startDate,
	targetDate,
	estimate,
	cycle,
	module: mod,
}: {
	project: string;
	title: string;
	priority: Option.Option<string>;
	state: Option.Option<string>;
	description: Option.Option<string>;
	assignee: Option.Option<string>;
	label: Array<string>;
	startDate: Option.Option<string>;
	targetDate: Option.Option<string>;
	estimate: Option.Option<string>;
	cycle: Option.Option<string>;
	module: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { key, id: projectId } = yield* resolveProject(project);
		const body: IssueCreatePayload = { name: title };
		if (Option.isSome(priority)) body.priority = priority.value;
		if (Option.isSome(state))
			body.state = yield* getStateId(projectId, state.value);
		if (Option.isSome(description)) {
			body.description_html = description.value;
		}
		if (Option.isSome(assignee)) {
			const memberId = yield* getMemberId(assignee.value);
			body.assignees = [memberId];
		}
		if (label.length > 0) {
			const labelIds: string[] = [];
			for (const l of label) {
				labelIds.push(yield* getLabelId(projectId, l));
			}
			body.labels = labelIds;
		}
		if (Option.isSome(startDate)) {
			body.start_date = startDate.value;
		}
		if (Option.isSome(targetDate)) {
			body.target_date = targetDate.value;
		}
		if (Option.isSome(estimate)) {
			body.estimate_point = estimate.value;
		}
		const raw = yield* api.post(`projects/${projectId}/issues/`, body);
		const created = yield* decodeOrFail(IssueSchema, raw);

		if (Option.isSome(cycle)) {
			yield* requireProjectFeature(projectId, "cycle_view");
			const resolved = yield* resolveCycle(projectId, cycle.value);
			yield* api.post(
				`projects/${projectId}/cycles/${resolved.id}/cycle-issues/`,
				{ issues: [created.id] },
			);
		}

		if (Option.isSome(mod)) {
			yield* requireProjectFeature(projectId, "module_view");
			const resolved = yield* resolveModule(projectId, mod.value);
			yield* api.post(
				`projects/${projectId}/modules/${resolved.id}/module-issues/`,
				{ issues: [created.id] },
			);
		}

		yield* Console.log(
			`Created ${key}-${created.sequence_id}: ${created.name}`,
		);
	});
}

export const issueCreate = Command.make(
	"create",
	{
		priority: createPriorityOption,
		state: createStateOption,
		description: createDescriptionOption,
		assignee: createAssigneeOption,
		label: createLabelOption,
		startDate: createStartDateOption,
		targetDate: createTargetDateOption,
		estimate: createEstimateOption,
		cycle: createCycleOption,
		module: createModuleOption,
		title: createTitleOption,
		project: createProjectArg,
	},
	issueCreateHandler,
).pipe(
	Command.withDescription(
		'Create a new issue in a project.\n\nExamples:\n  plane issue create --title "Migrate Button component"\n  plane issue create --title "Fix pipeline" --start-date 2026-04-01 --target-date 2026-04-15\n  plane issue create --title "Bug fix" --label bug --label urgent\n  plane issue create --title "Sprint task" --cycle "Sprint 3"\n  plane issue create --title "Backend task" --module "Backend"',
	),
);
// --- issue activity ---
export function issueActivityHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const raw = yield* api.get(
			`projects/${projectId}/issues/${issue.id}/activities/`,
		);
		const { results } = yield* decodeOrFail(ActivitiesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No activity found");
			return;
		}
		const lines = results.map((a) => {
			const who = a.actor_detail?.display_name ?? "?";
			const when = a.created_at.slice(0, 16).replace("T", " ");
			if (a.field) {
				const from = a.old_value ?? "—";
				const to = a.new_value ?? "—";
				return `${when}  ${who}  ${a.field}: ${from} → ${to}`;
			}
			return `${when}  ${who}  ${a.verb ?? "updated"}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const issueActivity = Command.make(
	"activity",
	{ ref: refArg },
	issueActivityHandler,
).pipe(
	Command.withDescription(
		"Show audit trail for an issue — who changed what and when.\n\nExample:\n  plane issue activity PROJ-29",
	),
);
// --- issue delete ---
export function issueDeleteHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.delete(`projects/${projectId}/issues/${issue.id}/`);
		yield* Console.log(`Deleted ${ref}`);
	});
}

export const issueDelete = Command.make(
	"delete",
	{ ref: refArg },
	issueDeleteHandler,
).pipe(
	Command.withDescription(
		"Permanently delete an issue. This cannot be undone.",
	),
);
// --- issue (parent) ---
export const issue = Command.make("issue").pipe(
	Command.withDescription(
		"Manage individual issues. Use 'plane issue <subcommand> --help' for details.\n\nSubcommands: get, create, update, delete, comment, activity, link, comments, worklogs",
	),
	Command.withSubcommands([
		issueGet,
		issueCreate,
		issueUpdate,
		issueDelete,
		issueComment,
		issueActivity,
		issueLink,
		issueComments,
		issueWorklogs,
	]),
);
