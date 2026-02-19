import { describe, expect, it } from "bun:test";
import { escapeHtmlText, formatIssue } from "@/format";
import type { Issue } from "@/config";

const stateObj = { id: "s1", name: "In Progress", group: "started" };

function makeIssue(overrides: Partial<Issue> = {}): Issue {
	return {
		id: "abc",
		sequence_id: 7,
		name: "Do the thing",
		priority: "medium",
		state: stateObj,
		...overrides,
	};
}

describe("formatIssue", () => {
	it("formats a basic issue with object state", () => {
		const result = formatIssue(makeIssue(), "ACME");
		expect(result).toContain("ACME-  7");
		expect(result).toContain("[started   ]");
		expect(result).toContain("In Progress");
		expect(result).toContain("Do the thing");
	});

	it("shows ? for state name and group when state is a string", () => {
		const result = formatIssue(makeIssue({ state: "some-uuid" }), "WEB");
		expect(result).toContain("[?");
		expect(result).toContain("?");
	});

	it("pads sequence_id to 3 characters", () => {
		const result = formatIssue(makeIssue({ sequence_id: 1 }), "OPS");
		expect(result).toContain("OPS-  1");
	});

	it("uses the provided project key", () => {
		const result = formatIssue(makeIssue(), "XYZ");
		expect(result).toStartWith("XYZ-");
	});

	it("includes issue name", () => {
		const result = formatIssue(makeIssue({ name: "Fix everything" }), "ACME");
		expect(result).toContain("Fix everything");
	});

	it("pads state group to 10 characters", () => {
		const shortState = { id: "s2", name: "Todo", group: "todo" };
		const result = formatIssue(makeIssue({ state: shortState }), "ACME");
		// group "todo" padded to 10: "todo      "
		expect(result).toContain("[todo      ]");
	});

	it("pads state name to 12 characters", () => {
		const result = formatIssue(makeIssue({ state: stateObj }), "ACME");
		// "In Progress " padded to 12
		expect(result).toContain("In Progress ");
	});
});

describe("escapeHtmlText", () => {
	it("escapes ampersands", () => {
		expect(escapeHtmlText("a & b")).toBe("a &amp; b");
	});

	it("escapes < and >", () => {
		expect(escapeHtmlText("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
	});

	it("escapes & before < to avoid double-escaping", () => {
		expect(escapeHtmlText("&lt;")).toBe("&amp;lt;");
	});

	it("passes plain text through unchanged", () => {
		expect(escapeHtmlText("hello world")).toBe("hello world");
	});
});
