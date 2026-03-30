import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	ActivitiesResponseSchema,
	CommentsResponseSchema,
	IssueLinkSchema,
	IssueLinksResponseSchema,
	IssueSchema,
	WorklogSchema,
	WorklogsResponseSchema,
} from "../config.js";
import { escapeHtmlText } from "../format.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import {
	findIssueBySeq,
	getLabelId,
	getMemberId,
	getStateId,
	parseIssueRef,
	resolveProject,
} from "../resolve.js";

const refArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference, e.g. PROJ-29"),
);
// --- Typed payload interfaces ---
interface IssueUpdatePayload {
	state?: string;
	priority?: string;
	name?: string;
	description_html?: string;
	assignees?: string[];
	label_ids?: string[];
}

interface IssueCreatePayload {
	name: string;
	priority?: string;
	state?: string;
	description_html?: string;
	assignees?: string[];
	label_ids?: string[];
}

interface WorklogPayload {
	duration: number;
	description?: string;
}
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

const labelOption = Options.optional(Options.text("label")).pipe(
	Options.withDescription("Set issue label by name"),
);

const noAssigneeOption = Options.boolean("no-assignee").pipe(
	Options.withDescription("Clear all assignees"),
	Options.withDefault(false),
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
}: {
	ref: string;
	state: Option.Option<string>;
	priority: Option.Option<string>;
	title: Option.Option<string>;
	description: Option.Option<string>;
	assignee: Option.Option<string>;
	label: Option.Option<string>;
	noAssignee: boolean;
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
		if (Option.isSome(label)) {
			const labelId = yield* getLabelId(projectId, label.value);
			body.label_ids = [labelId];
		}

		if (Object.keys(body).length === 0) {
			yield* Effect.fail(
				new Error(
					"Nothing to update. Specify --state, --priority, --title, --description, --assignee, --label, or --no-assignee",
				),
			);
		}

		const raw = yield* api.patch(
			`projects/${projectId}/issues/${issue.id}/`,
			body,
		);
		const updated = yield* decodeOrFail(IssueSchema, raw);
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
		ref: refArg,
	},
	issueUpdateHandler,
).pipe(
	Command.withDescription(
		'Update an issue\'s state, priority, title, description, or assignee. Options must come before the REF argument.\n\nExamples:\n  plane issue update --state completed PROJ-29\n  plane issue update --priority high WEB-5\n  plane issue update --title "New issue title" PROJ-29\n  plane issue update --assignee "Jane Doe" PROJ-29\n  plane issue update --no-assignee PROJ-29\n  plane issue update --description "New description" PROJ-29',
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
const titleArg = Args.text({ name: "title" }).pipe(
	Args.withDescription("Issue title"),
);
const projectRefArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ). Use '@current' for the saved default project.",
	),
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

const createLabelOption = Options.optional(Options.text("label")).pipe(
	Options.withDescription("Set issue label by name"),
);

export function issueCreateHandler({
	project,
	title,
	priority,
	state,
	description,
	assignee,
	label,
}: {
	project: string;
	title: string;
	priority: Option.Option<string>;
	state: Option.Option<string>;
	description: Option.Option<string>;
	assignee: Option.Option<string>;
	label: Option.Option<string>;
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
		if (Option.isSome(label)) {
			const labelId = yield* getLabelId(projectId, label.value);
			body.label_ids = [labelId];
		}
		const raw = yield* api.post(`projects/${projectId}/issues/`, body);
		const created = yield* decodeOrFail(IssueSchema, raw);
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
		project: projectRefArg,
		title: titleArg,
	},
	issueCreateHandler,
).pipe(
	Command.withDescription(
		'Create a new issue in a project. Use @current to target the saved default project.\n\nExamples:\n  plane issue create PROJ "Migrate Button component"\n  plane issue create @current "Migrate Button component"\n  plane issue create --priority high --state started PROJ "Fix lint pipeline"\n  plane issue create --description "Detailed context here" PROJ "Add dark mode"\n  plane issue create --assignee "Jane Doe" PROJ "Onboarding bug"',
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
// --- issue link list ---
export function issueLinkListHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const raw = yield* api.get(
			`projects/${projectId}/issues/${issue.id}/issue-links/`,
		);
		const { results } = yield* decodeOrFail(IssueLinksResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No links");
			return;
		}
		const lines = results.map(
			(l) => `${l.id}  ${l.title ?? "(no title)"}  ${l.url}`,
		);
		yield* Console.log(lines.join("\n"));
	});
}

export const issueLinkList = Command.make(
	"list",
	{ ref: refArg },
	issueLinkListHandler,
).pipe(Command.withDescription("List URL links attached to an issue."));
// --- issue link add ---
const urlArg = Args.text({ name: "url" }).pipe(
	Args.withDescription("URL to link"),
);
const linkTitleOption = Options.optional(Options.text("title")).pipe(
	Options.withDescription("Human-readable title for the link"),
);

export function issueLinkAddHandler({
	ref,
	url,
	title,
}: {
	ref: string;
	url: string;
	title: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const body: Record<string, string> = { url };
		if (Option.isSome(title)) body.title = title.value;
		const raw = yield* api.post(
			`projects/${projectId}/issues/${issue.id}/issue-links/`,
			body,
		);
		const link = yield* decodeOrFail(IssueLinkSchema, raw);
		yield* Console.log(`Link added: ${link.id}  ${link.url}`);
	});
}

export const issueLinkAdd = Command.make(
	"add",
	{ title: linkTitleOption, ref: refArg, url: urlArg },
	issueLinkAddHandler,
).pipe(
	Command.withDescription(
		'Attach a URL link to an issue.\n\nExamples:\n  plane issue link add PROJ-29 https://github.com/org/repo/pull/42\n  plane issue link add --title "Design doc" PROJ-29 https://docs.example.com',
	),
);
// --- issue link remove ---
const linkIdArg = Args.text({ name: "link-id" }).pipe(
	Args.withDescription("Link ID (from 'plane issue link list')"),
);

export function issueLinkRemoveHandler({
	ref,
	linkId,
}: {
	ref: string;
	linkId: string;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.delete(
			`projects/${projectId}/issues/${issue.id}/issue-links/${linkId}/`,
		);
		yield* Console.log(`Link ${linkId} removed from ${ref}`);
	});
}

export const issueLinkRemove = Command.make(
	"remove",
	{ ref: refArg, linkId: linkIdArg },
	issueLinkRemoveHandler,
).pipe(Command.withDescription("Remove a URL link from an issue by link ID."));
// --- issue link (parent) ---
export const issueLink = Command.make("link").pipe(
	Command.withDescription(
		"Manage URL links on an issue. Subcommands: list, add, remove",
	),
	Command.withSubcommands([issueLinkList, issueLinkAdd, issueLinkRemove]),
);
// --- issue comments list ---
export function issueCommentsListHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const raw = yield* api.get(
			`projects/${projectId}/issues/${issue.id}/comments/`,
		);
		const { results } = yield* decodeOrFail(CommentsResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No comments");
			return;
		}
		const lines = results.map((c) => {
			const who = c.actor_detail?.display_name ?? "?";
			const when = c.created_at.slice(0, 16).replace("T", " ");
			const text = (c.comment_html ?? "").replace(/<[^>]+>/g, "").trim();
			return `${c.id}  ${when}  ${who}: ${text}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const issueCommentsList = Command.make(
	"list",
	{ ref: refArg },
	issueCommentsListHandler,
).pipe(
	Command.withDescription(
		"List comments on an issue. Shows comment ID, timestamp, author, and plain text.\n\nExample:\n  plane issue comments list PROJ-29",
	),
);
// --- issue comment update ---
const commentIdArg = Args.text({ name: "comment-id" }).pipe(
	Args.withDescription("Comment ID (from 'plane issue comments list')"),
);

export function issueCommentUpdateHandler({
	ref,
	commentId,
	text,
}: {
	ref: string;
	commentId: string;
	text: string;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const escaped = escapeHtmlText(text);
		yield* api.patch(
			`projects/${projectId}/issues/${issue.id}/comments/${commentId}/`,
			{ comment_html: `<p>${escaped}</p>` },
		);
		yield* Console.log(`Comment ${commentId} updated`);
	});
}

export const issueCommentUpdate = Command.make(
	"update",
	{ ref: refArg, commentId: commentIdArg, text: textArg },
	issueCommentUpdateHandler,
).pipe(
	Command.withDescription(
		'Edit an existing comment.\n\nExample:\n  plane issue comments update PROJ-29 <comment-id> "Updated text"',
	),
);
// --- issue comment delete ---
export function issueCommentDeleteHandler({
	ref,
	commentId,
}: {
	ref: string;
	commentId: string;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.delete(
			`projects/${projectId}/issues/${issue.id}/comments/${commentId}/`,
		);
		yield* Console.log(`Comment ${commentId} deleted`);
	});
}

export const issueCommentDelete = Command.make(
	"delete",
	{ ref: refArg, commentId: commentIdArg },
	issueCommentDeleteHandler,
).pipe(Command.withDescription("Delete a comment from an issue."));
// --- issue comments (parent) ---
export const issueComments = Command.make("comments").pipe(
	Command.withDescription(
		"Manage comments on an issue. Subcommands: list, update, delete\n\nNote: use 'plane issue comment REF TEXT' to add a new comment.",
	),
	Command.withSubcommands([
		issueCommentsList,
		issueCommentUpdate,
		issueCommentDelete,
	]),
);
// --- issue worklogs list ---
export function issueWorklogsListHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const raw = yield* api.get(
			`projects/${projectId}/issues/${issue.id}/worklogs/`,
		);
		const { results } = yield* decodeOrFail(WorklogsResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No worklogs");
			return;
		}
		const lines = results.map((w) => {
			const who = w.logged_by_detail?.display_name ?? "?";
			const when = w.created_at.slice(0, 10);
			const hrs = (w.duration / 60).toFixed(1);
			const desc = w.description ?? "";
			return `${w.id}  ${when}  ${who}  ${hrs}h  ${desc}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const issueWorklogsList = Command.make(
	"list",
	{ ref: refArg },
	issueWorklogsListHandler,
).pipe(
	Command.withDescription(
		"List time log entries for an issue. Duration shown in hours.\n\nExample:\n  plane issue worklogs list PROJ-29",
	),
);
// --- issue worklogs add ---
const durationArg = Args.integer({ name: "minutes" }).pipe(
	Args.withDescription("Time spent in minutes"),
);
const worklogDescOption = Options.optional(Options.text("description")).pipe(
	Options.withDescription("Optional description of work done"),
);

export function issueWorklogsAddHandler({
	ref,
	duration,
	description,
}: {
	ref: string;
	duration: number;
	description: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const body: WorklogPayload = { duration };
		if (Option.isSome(description)) body.description = description.value;
		const raw = yield* api.post(
			`projects/${projectId}/issues/${issue.id}/worklogs/`,
			body,
		);
		const log = yield* decodeOrFail(WorklogSchema, raw);
		const hrs = (log.duration / 60).toFixed(1);
		yield* Console.log(`Logged ${hrs}h on ${ref} (${log.id})`);
	});
}

export const issueWorklogsAdd = Command.make(
	"add",
	{ description: worklogDescOption, ref: refArg, duration: durationArg },
	issueWorklogsAddHandler,
).pipe(
	Command.withDescription(
		'Log time spent on an issue (duration in minutes).\n\nExamples:\n  plane issue worklogs add PROJ-29 90\n  plane issue worklogs add --description "code review" PROJ-29 30',
	),
);
// --- issue worklogs (parent) ---
export const issueWorklogs = Command.make("worklogs").pipe(
	Command.withDescription(
		"Manage time logs for an issue. Subcommands: list, add",
	),
	Command.withSubcommands([issueWorklogsList, issueWorklogsAdd]),
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
