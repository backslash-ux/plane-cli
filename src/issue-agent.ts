import { readFile } from "node:fs/promises";
import { Effect, Option } from "effect";
import { api, decodeOrFail } from "./api.js";
import { IssuesResponseSchema } from "./config.js";
import { normalizeIssueForJson } from "./output.js";

export function resolveDescriptionInput({
	description,
	fromFile,
	stdin,
}: {
	description: Option.Option<string>;
	fromFile: Option.Option<string> | undefined;
	stdin: boolean | undefined;
}): Effect.Effect<Option.Option<string>, Error> {
	return Effect.gen(function* () {
		const hasDescription = Option.isSome(description);
		const hasFile = fromFile !== undefined && Option.isSome(fromFile);
		const hasStdin = stdin === true;
		const sourceCount = [hasDescription, hasFile, hasStdin].filter(
			Boolean,
		).length;
		if (sourceCount > 1) {
			return yield* Effect.fail(
				new Error("Choose only one of --description, --from-file, or --stdin."),
			);
		}
		if (hasFile) {
			const content = yield* Effect.tryPromise({
				try: () => readFile(fromFile.value, "utf8"),
				catch: (error) =>
					error instanceof Error ? error : new Error(String(error)),
			});
			return Option.some(content);
		}
		if (hasStdin) {
			const content = yield* Effect.tryPromise({
				try: readStdin,
				catch: (error) =>
					error instanceof Error ? error : new Error(String(error)),
			});
			return Option.some(content);
		}
		return description;
	});
}

export function findDuplicateCandidates({
	projectId,
	projectKey,
	title,
	modes,
}: {
	projectId: string;
	projectKey: string;
	title: string;
	modes: string;
}) {
	return Effect.gen(function* () {
		const parsedModes = parseDedupeModes(modes);
		const raw = yield* api.get(
			`projects/${projectId}/issues/?order_by=sequence_id`,
		);
		const { results } = yield* decodeOrFail(IssuesResponseSchema, raw);
		const normalizedTitle = normalizeTitle(title);
		const candidates = results
			.map((issue) => {
				const exact =
					parsedModes.has("title") &&
					normalizeTitle(issue.name) === normalizedTitle;
				const similarity = titleSimilarity(title, issue.name);
				const similar = parsedModes.has("similarity") && similarity >= 0.9;
				if (!exact && !similar) return null;
				const normalized = normalizeIssueForJson(projectKey, issue);
				return {
					ref: normalized.ref,
					id: issue.id,
					title: issue.name,
					match: exact ? "title" : "similarity",
					similarity,
					issue: normalized,
				};
			})
			.filter(
				(candidate): candidate is NonNullable<typeof candidate> =>
					candidate !== null,
			);
		return {
			action: "possible_duplicate",
			title,
			would_create: false,
			candidates,
		};
	});
}

function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data));
		process.stdin.on("error", reject);
	});
}

function parseDedupeModes(value: string): Set<"title" | "similarity"> {
	const modes = new Set<"title" | "similarity">();
	for (const raw of value.split(",")) {
		const mode = raw.trim().toLowerCase();
		if (mode === "title" || mode === "similarity") modes.add(mode);
	}
	if (modes.size === 0) modes.add("title");
	return modes;
}

function titleSimilarity(left: string, right: string): number {
	const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
	const rightTokens = new Set(normalizeTitle(right).split(" ").filter(Boolean));
	const union = new Set([...leftTokens, ...rightTokens]);
	if (union.size === 0) return 0;
	let intersection = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) intersection += 1;
	}
	return intersection / union.size;
}

function normalizeTitle(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}
