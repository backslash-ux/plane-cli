import { Effect, Schema } from "effect";
import { getConfig } from "./user-config.js";

function request(
	method: string,
	path: string,
	body?: unknown,
): Effect.Effect<unknown, Error> {
	return Effect.tryPromise({
		try: async () => {
			const { token, host, workspace } = getConfig();
			if (!token)
				throw new Error(
					"No API token configured. Run 'plane init', 'plane init --local', 'plane . init', or set PLANE_API_TOKEN.",
				);
			if (!workspace)
				throw new Error(
					"No workspace configured. Run 'plane init', 'plane init --local', 'plane . init', or set PLANE_WORKSPACE.",
				);
			let url = `${host}/api/v1/workspaces/${workspace}/${path}`;

			// Always expand state and labels on issue list/get calls (not intake-issues/ or cycle-issues/)
			if (method === "GET" && /(?:^|\/)(?:issues\/)/.test(path)) {
				url += url.includes("?")
					? "&expand=state,labels"
					: "?expand=state,labels";
			}

			const headers: Record<string, string> = {
				"X-Api-Key": token,
			};
			if (body !== undefined) {
				headers["Content-Type"] = "application/json";
			}

			const res = await fetch(url, {
				method,
				headers,
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});

			if (!res.ok) {
				const text = await res.text();
				throw new Error(`HTTP ${res.status}: ${text}`);
			}

			// 204 No Content
			if (res.status === 204) return null;

			// Use text + lenient parse to handle bare control characters (U+0000–U+001F)
			// that may appear inside JSON string values (e.g. description_html with \n in <pre>).
			const text = await res.text();
			try {
				return JSON.parse(text);
			} catch {
				// Escape bare control characters inside JSON string values and retry.
				const sanitized = text.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
					match.replace(/./gsu, (c) => {
						const code = c.charCodeAt(0);
						if (code > 0x1f) {
							return c;
						}
						const hex = code.toString(16).padStart(4, "0");
						return `\\u${hex}`;
					}),
				);
				return JSON.parse(sanitized);
			}
		},
		catch: (e) => (e instanceof Error ? e : new Error(String(e))),
	});
}

export const api = {
	get: (path: string) => request("GET", path),
	post: (path: string, body: unknown) => request("POST", path, body),
	patch: (path: string, body: unknown) => request("PATCH", path, body),
	delete: (path: string) => request("DELETE", path),
};

export function decodeOrFail<A, I>(
	schema: Schema.Schema<A, I>,
	data: unknown,
): Effect.Effect<A, Error> {
	return Schema.decodeUnknown(schema)(data).pipe(
		Effect.mapError((e) => new Error(String(e))),
	);
}
