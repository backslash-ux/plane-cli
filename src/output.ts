import { Options } from "@effect/cli";
import type { Issue, State } from "./config.js";
import { getConfig } from "./user-config.js";

const jsonIdx = process.argv.indexOf("--json");
const xmlIdx = process.argv.indexOf("--xml");

export const jsonMode = jsonIdx !== -1;
export const xmlMode = xmlIdx !== -1;

if (jsonIdx !== -1) process.argv.splice(jsonIdx, 1);
if (xmlIdx !== -1) process.argv.splice(xmlIdx, 1);

export const jsonOption = Options.boolean("json").pipe(
	Options.withDescription("Print machine-readable JSON output"),
	Options.withDefault(false),
);

export const xmlOption = Options.boolean("xml").pipe(
	Options.withDescription("Print machine-readable XML output"),
	Options.withDefault(false),
);

function escapeXml(val: unknown): string {
	return String(val ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function toXmlItem(obj: Record<string, unknown>, tag = "item"): string {
	const attrs = Object.entries(obj)
		.filter(([, v]) => v === null || typeof v !== "object")
		.map(([k, v]) => `${k}="${escapeXml(v)}"`)
		.join(" ");
	const children = Object.entries(obj)
		.filter(([, v]) => v !== null && typeof v === "object")
		.map(([k, v]) =>
			Array.isArray(v)
				? `<${k}>${v
						.map((i) =>
							typeof i === "object" && i !== null
								? toXmlItem(i as Record<string, unknown>)
								: `<item>${escapeXml(i)}</item>`,
						)
						.join("")}</${k}>`
				: toXmlItem(v as Record<string, unknown>, k),
		)
		.join("");
	return `<${tag}${attrs ? ` ${attrs}` : ""}>${children}</${tag}>`;
}

export function toXml(results: readonly unknown[]): string {
	return `<results>\n${results.map((r) => `  ${toXmlItem(r as Record<string, unknown>)}`).join("\n")}\n</results>`;
}

export function issueRef(
	projectKey: string,
	issue: Pick<Issue, "sequence_id">,
) {
	return `${projectKey}-${issue.sequence_id}`;
}

export function normalizeIssueForJson(projectKey: string, issue: Issue) {
	const state = issue.state as State | string;
	const stateName = typeof state === "object" ? state.name : state;
	const stateGroup = typeof state === "object" ? state.group : null;
	const ref = issueRef(projectKey, issue);
	return {
		...issue,
		ref,
		title: issue.name,
		state_name: stateName,
		state_group: stateGroup,
		url: issueUrl(ref),
	};
}

export function issueMutationResult({
	action,
	projectKey,
	issue,
}: {
	action: "created" | "updated";
	projectKey: string;
	issue: Issue;
}) {
	const normalized = normalizeIssueForJson(projectKey, issue);
	return {
		action,
		ref: normalized.ref,
		id: normalized.id,
		title: normalized.title,
		state: normalized.state,
		state_name: normalized.state_name,
		state_group: normalized.state_group,
		priority: normalized.priority,
		url: normalized.url,
		issue: normalized,
	};
}

function issueUrl(ref: string): string {
	try {
		const { host, workspace } = getConfig();
		const [projectKey] = ref.split("-");
		return `${host.replace(/\/$/, "")}/${workspace}/projects/${projectKey}/issues/${ref}`;
	} catch {
		return ref;
	}
}
