import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import {
	CommentsResponseSchema,
	IssueLinkSchema,
	IssueLinksResponseSchema,
	WorklogSchema,
	WorklogsResponseSchema,
} from "../config.js";
import { escapeHtmlText } from "../format.js";
import {
	issueLinkPaths,
	issueWorklogPaths,
	requestWithFallback,
	type WorklogPayload,
} from "../issue-support.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { findIssueBySeq, parseIssueRef } from "../resolve.js";

const refArg = Args.text({ name: "ref" }).pipe(
	Args.withDescription("Issue reference, e.g. PROJ-29"),
);
const textArg = Args.text({ name: "text" }).pipe(
	Args.withDescription("Comment text to add"),
);

// --- issue link list ---
export function issueLinkListHandler({ ref }: { ref: string }) {
	return Effect.gen(function* () {
		const { projectId, seq } = yield* parseIssueRef(ref);
		const issue = yield* findIssueBySeq(projectId, seq);
		const raw = yield* requestWithFallback(
			issueLinkPaths(projectId, issue.id),
			(path) => api.get(path),
			`Issue links are not available for ${ref} on this Plane instance or API version.`,
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
		const raw = yield* requestWithFallback(
			issueLinkPaths(projectId, issue.id),
			(path) => api.post(path, body),
			`Issue links are not available for ${ref} on this Plane instance or API version.`,
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
		const basePath = yield* requestWithFallback(
			issueLinkPaths(projectId, issue.id),
			(path) => api.get(path).pipe(Effect.as(path)),
			`Issue links are not available for ${ref} on this Plane instance or API version.`,
		);
		yield* api.delete(`${basePath}${linkId}/`);
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
		const raw = yield* requestWithFallback(
			issueWorklogPaths(projectId, issue.id),
			(path) => api.get(path),
			`Issue worklogs are not available for ${ref} on this Plane instance or API version.`,
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
		const raw = yield* requestWithFallback(
			issueWorklogPaths(projectId, issue.id),
			(path) => api.post(path, body),
			`Issue worklogs are not available for ${ref} on this Plane instance or API version.`,
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
