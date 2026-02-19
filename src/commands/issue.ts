import { Command, Options, Args } from "@effect/cli";
import { Console, Effect } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	IssueSchema,
	ActivitiesResponseSchema,
	IssueLinksResponseSchema,
	IssueLinkSchema,
	CommentsResponseSchema,
	WorklogsResponseSchema,
	WorklogSchema,
} from "../config.js";
import {
	findIssueBySeq,
	getMemberId,
	getStateId,
	parseIssueRef,
	resolveProject,
} from "../resolve.js";
import { jsonMode, xmlMode, toXml } from "../output.js";
import { escapeHtmlText } from "../format.js";

const refArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference, e.g. PROJ-29"),
);

// --- issue get ---

export const issueGet = Command.make("get", { ref: refArg }, ({ ref }) =>
	Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* Console.log(JSON.stringify(issue, null, 2));
	}),
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

const descriptionOption = Options.optional(Options.text("description")).pipe(
	Options.withDescription("Issue description (plain text, stored as HTML)"),
);

const assigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription("Assign to a member (display name, email, or UUID)"),
);

const noAssigneeOption = Options.boolean("no-assignee").pipe(
	Options.withDescription("Clear all assignees"),
	Options.withDefault(false),
);

export const issueUpdate = Command.make(
	"update",
	{
		state: stateOption,
		priority: priorityOption,
		description: descriptionOption,
		assignee: assigneeOption,
		noAssignee: noAssigneeOption,
		ref: refArg,
	},
	({ ref, state, priority, description, assignee, noAssignee }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);

			const body: Record<string, unknown> = {};

			if (state._tag === "Some") {
				body["state"] = yield* getStateId(projectId, state.value);
			}
			if (priority._tag === "Some") {
				body["priority"] = priority.value;
			}
			if (description._tag === "Some") {
				const escaped = escapeHtmlText(description.value);
				body["description_html"] = `<p>${escaped}</p>`;
			}
			if (noAssignee) {
				body["assignees"] = [];
			} else if (assignee._tag === "Some") {
				const memberId = yield* getMemberId(assignee.value);
				body["assignees"] = [memberId];
			}

			if (Object.keys(body).length === 0) {
				yield* Effect.fail(
					new Error(
						"Nothing to update. Specify --state, --priority, --description, --assignee, or --no-assignee",
					),
				);
			}

			const raw = yield* api.patch(
				`projects/${projectId}/issues/${issue.id}/`,
				body,
			);
			const updated = yield* decodeOrFail(IssueSchema, raw);
			yield* Console.log(
				`Updated ${ref}: state=${String(updated.state)} priority=${updated.priority}`,
			);
		}),
).pipe(
	Command.withDescription(
		'Update an issue\'s state, priority, description, or assignee. Options must come before the REF argument.\n\nExamples:\n  plane issue update --state completed PROJ-29\n  plane issue update --priority high WEB-5\n  plane issue update --assignee "Jane Doe" PROJ-29\n  plane issue update --no-assignee PROJ-29\n  plane issue update --description "New description" PROJ-29',
	),
);

// --- issue comment ---

const textArg = Args.text({ name: "text" }).pipe(
	Args.withDescription("Comment text to add"),
);

export const issueComment = Command.make(
	"comment",
	{ ref: refArg, text: textArg },
	({ ref, text }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			const escaped = escapeHtmlText(text);
			yield* api.post(`projects/${projectId}/issues/${issue.id}/comments/`, {
				comment_html: `<p>${escaped}</p>`,
			});
			yield* Console.log(`Comment added to ${ref}`);
		}),
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
	Args.withDescription("Project identifier (e.g. PROJ)"),
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
	Options.withDescription("Issue description (plain text, stored as HTML)"),
);

const createAssigneeOption = Options.optional(Options.text("assignee")).pipe(
	Options.withDescription("Assign to a member (display name, email, or UUID)"),
);

export const issueCreate = Command.make(
	"create",
	{
		priority: createPriorityOption,
		state: createStateOption,
		description: createDescriptionOption,
		assignee: createAssigneeOption,
		project: projectRefArg,
		title: titleArg,
	},
	({ project, title, priority, state, description, assignee }) =>
		Effect.gen(function* () {
			const { key, id: projectId } = yield* resolveProject(project);
			const body: Record<string, unknown> = { name: title };
			if (priority._tag === "Some") body["priority"] = priority.value;
			if (state._tag === "Some")
				body["state"] = yield* getStateId(projectId, state.value);
			if (description._tag === "Some") {
				const escaped = escapeHtmlText(description.value);
				body["description_html"] = `<p>${escaped}</p>`;
			}
			if (assignee._tag === "Some") {
				const memberId = yield* getMemberId(assignee.value);
				body["assignees"] = [memberId];
			}
			const raw = yield* api.post(`projects/${projectId}/issues/`, body);
			const created = yield* decodeOrFail(IssueSchema, raw);
			yield* Console.log(
				`Created ${key}-${created.sequence_id}: ${created.name}`,
			);
		}),
).pipe(
	Command.withDescription(
		'Create a new issue in a project.\n\nExamples:\n  plane issue create PROJ "Migrate Button component"\n  plane issue create --priority high --state started PROJ "Fix lint pipeline"\n  plane issue create --description "Detailed context here" PROJ "Add dark mode"\n  plane issue create --assignee "Jane Doe" PROJ "Onboarding bug"',
	),
);

// --- issue activity ---

export const issueActivity = Command.make(
	"activity",
	{ ref: refArg },
	({ ref }) =>
		Effect.gen(function* () {
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
		}),
).pipe(
	Command.withDescription(
		"Show audit trail for an issue — who changed what and when.\n\nExample:\n  plane issue activity PROJ-29",
	),
);

// --- issue link list ---

export const issueLinkList = Command.make("list", { ref: refArg }, ({ ref }) =>
	Effect.gen(function* () {
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
	}),
).pipe(Command.withDescription("List URL links attached to an issue."));

// --- issue link add ---

const urlArg = Args.text({ name: "url" }).pipe(
	Args.withDescription("URL to link"),
);
const linkTitleOption = Options.optional(Options.text("title")).pipe(
	Options.withDescription("Human-readable title for the link"),
);

export const issueLinkAdd = Command.make(
	"add",
	{ title: linkTitleOption, ref: refArg, url: urlArg },
	({ ref, url, title }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			const body: Record<string, string> = { url };
			if (title._tag === "Some") body["title"] = title.value;
			const raw = yield* api.post(
				`projects/${projectId}/issues/${issue.id}/issue-links/`,
				body,
			);
			const link = yield* decodeOrFail(IssueLinkSchema, raw);
			yield* Console.log(`Link added: ${link.id}  ${link.url}`);
		}),
).pipe(
	Command.withDescription(
		'Attach a URL link to an issue.\n\nExamples:\n  plane issue link add PROJ-29 https://github.com/org/repo/pull/42\n  plane issue link add --title "Design doc" PROJ-29 https://docs.example.com',
	),
);

// --- issue link remove ---

const linkIdArg = Args.text({ name: "link-id" }).pipe(
	Args.withDescription("Link ID (from 'plane issue link list')"),
);

export const issueLinkRemove = Command.make(
	"remove",
	{ ref: refArg, linkId: linkIdArg },
	({ ref, linkId }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			yield* api.delete(
				`projects/${projectId}/issues/${issue.id}/issue-links/${linkId}/`,
			);
			yield* Console.log(`Link ${linkId} removed from ${ref}`);
		}),
).pipe(Command.withDescription("Remove a URL link from an issue by link ID."));

// --- issue link (parent) ---

export const issueLink = Command.make("link").pipe(
	Command.withDescription(
		"Manage URL links on an issue. Subcommands: list, add, remove",
	),
	Command.withSubcommands([issueLinkList, issueLinkAdd, issueLinkRemove]),
);

// --- issue comments list ---

export const issueCommentsList = Command.make(
	"list",
	{ ref: refArg },
	({ ref }) =>
		Effect.gen(function* () {
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
		}),
).pipe(
	Command.withDescription(
		"List comments on an issue. Shows comment ID, timestamp, author, and plain text.\n\nExample:\n  plane issue comments list PROJ-29",
	),
);

// --- issue comment update ---

const commentIdArg = Args.text({ name: "comment-id" }).pipe(
	Args.withDescription("Comment ID (from 'plane issue comments list')"),
);

export const issueCommentUpdate = Command.make(
	"update",
	{ ref: refArg, commentId: commentIdArg, text: textArg },
	({ ref, commentId, text }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			const escaped = escapeHtmlText(text);
			yield* api.patch(
				`projects/${projectId}/issues/${issue.id}/comments/${commentId}/`,
				{ comment_html: `<p>${escaped}</p>` },
			);
			yield* Console.log(`Comment ${commentId} updated`);
		}),
).pipe(
	Command.withDescription(
		'Edit an existing comment.\n\nExample:\n  plane issue comments update PROJ-29 <comment-id> "Updated text"',
	),
);

// --- issue comment delete ---

export const issueCommentDelete = Command.make(
	"delete",
	{ ref: refArg, commentId: commentIdArg },
	({ ref, commentId }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			yield* api.delete(
				`projects/${projectId}/issues/${issue.id}/comments/${commentId}/`,
			);
			yield* Console.log(`Comment ${commentId} deleted`);
		}),
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

export const issueWorklogsList = Command.make(
	"list",
	{ ref: refArg },
	({ ref }) =>
		Effect.gen(function* () {
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
		}),
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

export const issueWorklogsAdd = Command.make(
	"add",
	{ description: worklogDescOption, ref: refArg, duration: durationArg },
	({ ref, duration, description }) =>
		Effect.gen(function* () {
			const { projectId, seq } = yield* parseIssueRef(ref);
			const issue = yield* findIssueBySeq(projectId, seq);
			const body: Record<string, unknown> = { duration };
			if (description._tag === "Some") body["description"] = description.value;
			const raw = yield* api.post(
				`projects/${projectId}/issues/${issue.id}/worklogs/`,
				body,
			);
			const log = yield* decodeOrFail(WorklogSchema, raw);
			const hrs = (log.duration / 60).toFixed(1);
			yield* Console.log(`Logged ${hrs}h on ${ref} (${log.id})`);
		}),
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

export const issueDelete = Command.make("delete", { ref: refArg }, ({ ref }) =>
	Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		yield* api.delete(`projects/${projectId}/issues/${issue.id}/`);
		yield* Console.log(`Deleted ${ref}`);
	}),
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
