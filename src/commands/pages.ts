import { Args, Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { api, decodeOrFail } from "../api.js";
import { PageSchema, PagesResponseSchema } from "../config.js";
import { jsonMode, toXml, xmlMode } from "../output.js";
import { requireProjectFeature, resolveProject } from "../resolve.js";

const projectArg = Args.text({ name: "project" }).pipe(
	Args.withDescription(
		"Project identifier (e.g. PROJ, WEB, OPS). Use '@current' for the saved default project.",
	),
);

const listProjectArg = projectArg.pipe(Args.withDefault(""));

const pageIdArg = Args.text({ name: "page-id" }).pipe(
	Args.withDescription("Page UUID (from 'plane pages list')"),
);

const nameOption = Options.text("name").pipe(
	Options.withDescription("Page name/title"),
);

const nameOptionalOption = Options.optional(Options.text("name")).pipe(
	Options.withDescription("New page name/title"),
);

const descriptionOption = Options.optional(Options.text("description")).pipe(
	Options.withDescription("Page description as HTML (e.g. '<p>Hello</p>')"),
);

interface PageCreatePayload {
	name: string;
	description_html?: string;
}
interface PageUpdatePayload {
	name?: string;
	description_html?: string;
}

// --- pages list ---

export function pagesListHandler({ project }: { project: string }) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		const raw = yield* api.get(`projects/${id}/pages/`);
		const { results } = yield* decodeOrFail(PagesResponseSchema, raw);
		if (jsonMode) {
			yield* Console.log(JSON.stringify(results, null, 2));
			return;
		}
		if (xmlMode) {
			yield* Console.log(toXml(results));
			return;
		}
		if (results.length === 0) {
			yield* Console.log("No pages");
			return;
		}
		const lines = results.map((p) => {
			const updated = (p.updated_at ?? p.created_at).slice(0, 10);
			return `${p.id}  ${updated}  ${p.name}`;
		});
		yield* Console.log(lines.join("\n"));
	});
}

export const pagesList = Command.make(
	"list",
	{ project: listProjectArg },
	pagesListHandler,
).pipe(
	Command.withDescription(
		"List pages for a project. Shows page UUID, last updated date, and title. Omit PROJECT to use the saved current project.\n\nExample:\n  plane pages list PROJ",
	),
);

// --- pages get ---

export function pagesGetHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		const raw = yield* api.get(`projects/${id}/pages/${pageId}/`);
		const page = yield* decodeOrFail(PageSchema, raw);
		yield* Console.log(JSON.stringify(page, null, 2));
	});
}

export const pagesGet = Command.make(
	"get",
	{ project: projectArg, pageId: pageIdArg },
	pagesGetHandler,
).pipe(
	Command.withDescription(
		"Print full JSON for a page including description_html.\n\nExample:\n  plane pages get PROJ <page-id>",
	),
);

// --- pages create ---

export function pagesCreateHandler({
	project,
	name,
	description,
}: {
	project: string;
	name: string;
	description: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		const body: PageCreatePayload = { name };
		if (Option.isSome(description)) {
			body.description_html = description.value;
		}
		const raw = yield* api.post(`projects/${id}/pages/`, body);
		const page = yield* decodeOrFail(PageSchema, raw);
		yield* Console.log(`Created page ${page.id}: ${page.name}`);
	});
}

export const pagesCreate = Command.make(
	"create",
	{ project: projectArg, name: nameOption, description: descriptionOption },
	pagesCreateHandler,
).pipe(
	Command.withDescription(
		'Create a new page.\n\nExample:\n  plane pages create --name "My Page" PROJ',
	),
);

// --- pages update ---

export function pagesUpdateHandler({
	project,
	pageId,
	name,
	description,
}: {
	project: string;
	pageId: string;
	name: Option.Option<string>;
	description: Option.Option<string>;
}) {
	return Effect.gen(function* () {
		if (Option.isNone(name) && Option.isNone(description)) {
			yield* Effect.fail(new Error("provide at least --name or --description"));
		}
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		const body: PageUpdatePayload = {};
		if (Option.isSome(name)) body.name = name.value;
		if (Option.isSome(description)) body.description_html = description.value;
		const raw = yield* api.patch(`projects/${id}/pages/${pageId}/`, body);
		const page = yield* decodeOrFail(PageSchema, raw);
		yield* Console.log(`Updated page ${page.id}: ${page.name}`);
	});
}

export const pagesUpdate = Command.make(
	"update",
	{
		project: projectArg,
		pageId: pageIdArg,
		name: nameOptionalOption,
		description: descriptionOption,
	},
	pagesUpdateHandler,
).pipe(
	Command.withDescription(
		'Update a page\'s name or description.\n\nExample:\n  plane pages update --name "New Title" PROJ <page-id>',
	),
);

// --- pages delete ---

export function pagesDeleteHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		yield* api.delete(`projects/${id}/pages/${pageId}/`);
		yield* Console.log(`Deleted page ${pageId}`);
	});
}

export const pagesDelete = Command.make(
	"delete",
	{ project: projectArg, pageId: pageIdArg },
	pagesDeleteHandler,
).pipe(
	Command.withDescription(
		"Delete a page.\n\nExample:\n  plane pages delete PROJ <page-id>",
	),
);

// --- pages archive ---

export function pagesArchiveHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		yield* api.post(`projects/${id}/pages/${pageId}/archive/`, {});
		yield* Console.log(`Archived page ${pageId}`);
	});
}

export const pagesArchive = Command.make(
	"archive",
	{ project: projectArg, pageId: pageIdArg },
	pagesArchiveHandler,
).pipe(
	Command.withDescription(
		"Archive a page.\n\nExample:\n  plane pages archive PROJ <page-id>",
	),
);

// --- pages unarchive ---

export function pagesUnarchiveHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		yield* api.delete(`projects/${id}/pages/${pageId}/archive/`);
		yield* Console.log(`Unarchived page ${pageId}`);
	});
}

export const pagesUnarchive = Command.make(
	"unarchive",
	{ project: projectArg, pageId: pageIdArg },
	pagesUnarchiveHandler,
).pipe(
	Command.withDescription(
		"Unarchive a page.\n\nExample:\n  plane pages unarchive PROJ <page-id>",
	),
);

// --- pages lock ---

export function pagesLockHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		yield* api.post(`projects/${id}/pages/${pageId}/lock/`, {});
		yield* Console.log(`Locked page ${pageId}`);
	});
}

export const pagesLock = Command.make(
	"lock",
	{ project: projectArg, pageId: pageIdArg },
	pagesLockHandler,
).pipe(
	Command.withDescription(
		"Lock a page (prevent edits).\n\nExample:\n  plane pages lock PROJ <page-id>",
	),
);

// --- pages unlock ---

export function pagesUnlockHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		yield* api.delete(`projects/${id}/pages/${pageId}/lock/`);
		yield* Console.log(`Unlocked page ${pageId}`);
	});
}

export const pagesUnlock = Command.make(
	"unlock",
	{ project: projectArg, pageId: pageIdArg },
	pagesUnlockHandler,
).pipe(
	Command.withDescription(
		"Unlock a page.\n\nExample:\n  plane pages unlock PROJ <page-id>",
	),
);

// --- pages duplicate ---

export function pagesDuplicateHandler({
	project,
	pageId,
}: {
	project: string;
	pageId: string;
}) {
	return Effect.gen(function* () {
		const { id } = yield* resolveProject(project);
		yield* requireProjectFeature(id, "page_view");
		const raw = yield* api.post(
			`projects/${id}/pages/${pageId}/duplicate/`,
			{},
		);
		const page = yield* decodeOrFail(PageSchema, raw);
		yield* Console.log(`Duplicated page ${page.id}: ${page.name}`);
	});
}

export const pagesDuplicate = Command.make(
	"duplicate",
	{ project: projectArg, pageId: pageIdArg },
	pagesDuplicateHandler,
).pipe(
	Command.withDescription(
		"Duplicate a page.\n\nExample:\n  plane pages duplicate PROJ <page-id>",
	),
);

// --- pages (parent) ---

export const pages = Command.make("pages").pipe(
	Command.withDescription(
		"Manage project pages (documentation). Subcommands: list, get, create, update, delete, archive, unarchive, lock, unlock, duplicate\n\nExamples:\n  plane pages list PROJ\n  plane pages get PROJ <page-id>",
	),
	Command.withSubcommands([
		pagesList,
		pagesGet,
		pagesCreate,
		pagesUpdate,
		pagesDelete,
		pagesArchive,
		pagesUnarchive,
		pagesLock,
		pagesUnlock,
		pagesDuplicate,
	]),
);
