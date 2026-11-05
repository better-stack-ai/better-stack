import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? ".");
const samples = JSON.parse(
	await readFile(join(directory, "samples.json"), "utf8"),
).filter((sample) => !sample.warmup);
const metadata = JSON.parse(
	await readFile(join(directory, "metadata.json"), "utf8"),
);
assert.equal(
	metadata.failures.length,
	0,
	"Failed observations cannot become a performance claim",
);
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values, p) =>
	[...values].sort((a, b) => a - b)[
		Math.min(values.length - 1, Math.floor(values.length * p))
	];
let seed = 310;
const random = () => {
	seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
	return seed / 2 ** 32;
};
const metrics = [
	"ttfbMs",
	"fcpMs",
	"lcpMs",
	"contentVisibleMs",
	"shellHydrationMs",
	"routeReadyMs",
	"counterPaintMs",
	"editorInputPaintMs",
	"navigationReadyMs",
];
const results = [];
for (const route of ["core", "reader", "editor", "multi"]) {
	for (const cache of ["cold", "warm", "navigation"]) {
		const a = samples.filter(
			(sample) =>
				sample.variant === "v5" &&
				sample.route === route &&
				sample.cache === cache,
		);
		const b = samples.filter(
			(sample) =>
				sample.variant === "v6" &&
				sample.route === route &&
				sample.cache === cache,
		);
		if (!a.length && !b.length) continue;
		assert.equal(a.length, metadata.repetitions);
		assert.equal(b.length, metadata.repetitions);
		for (const metric of metrics) {
			if (a.every((sample) => sample[metric] === undefined)) continue;
			assert(
				a.every((sample) => Number.isFinite(sample[metric])) &&
					b.every((sample) => Number.isFinite(sample[metric])),
				`${route}/${cache}/${metric}: missing measurement`,
			);
			const before = a.map((sample) => sample[metric]);
			const after = b.map((sample) => sample[metric]);
			const paired = a.map((sample) => {
				const candidate = b.find(
					(other) => other.repetition === sample.repetition,
				);
				return candidate[metric] - sample[metric];
			});
			const bootstrap = Array.from({ length: 5000 }, () =>
				median(
					Array.from(
						{ length: paired.length },
						() => paired[Math.floor(random() * paired.length)],
					),
				),
			);
			const ci = [quantile(bootstrap, 0.025), quantile(bootstrap, 0.975)];
			results.push({
				route,
				cache,
				metric,
				observations: a.length,
				v5Median: median(before),
				v6Median: median(after),
				v5P10P90: [quantile(before, 0.1), quantile(before, 0.9)],
				v6P10P90: [quantile(after, 0.1), quantile(after, 0.9)],
				pairedMedianDeltaMs: median(paired),
				pairedMedianDeltaPercent: (100 * median(paired)) / median(before),
				pairedMedianDelta95CI: ci,
				direction:
					ci[1] < 0
						? "faster in this lab"
						: ci[0] > 0
							? "slower in this lab"
							: "inconclusive",
			});
		}
	}
}
await writeFile(
	join(directory, "summary.json"),
	`${JSON.stringify(results, null, 2)}\n`,
);
const lines = [
	"# Matched v5/v6 rendering benchmark",
	"",
	`Node ${metadata.node}; Chromium ${metadata.chromium}; Next.js 16.4.5; ${metadata.repetitions} paired observations per cell, with an excluded traced warm-up.`,
	"",
	"Timing values are milliseconds; negative paired deltas favor v6. The bootstrap interval summarizes repeated observations on this host, not field performance or different hardware. Shell hydration is reported separately from actual page/editor readiness. Counter interaction is a lab click-to-paint measurement, not field INP.",
	"",
	"| Route | Cache | Metric | v5 median | v6 median | Paired delta | 95% interval (ms) | Finding |",
	"| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
];
for (const row of results)
	lines.push(
		`| ${row.route} | ${row.cache} | ${row.metric} | ${row.v5Median.toFixed(1)} | ${row.v6Median.toFixed(1)} | ${row.pairedMedianDeltaMs.toFixed(1)} (${row.pairedMedianDeltaPercent.toFixed(1)}%) | ${row.pairedMedianDelta95CI.map((value) => value.toFixed(1)).join(" to ")} | ${row.direction} |`,
	);
lines.push(
	"",
	"## Asset transfer and cache observations",
	"",
	"| Route | Variant | Initial cold JS+CSS transfer median | Warm JS+CSS transfer median |",
	"| --- | --- | ---: | ---: |",
);
for (const route of ["core", "reader", "editor", "multi"])
	for (const variant of ["v5", "v6"]) {
		const size = (cache) =>
			median(
				samples
					.filter(
						(sample) =>
							sample.route === route &&
							sample.variant === variant &&
							sample.cache === cache,
					)
					.map((sample) => sample.jsTransferBytes + sample.cssTransferBytes),
			);
		lines.push(`| ${route} | ${variant} | ${size("cold")} | ${size("warm")} |`);
	}
lines.push(
	"",
	"Network transfer includes protocol overhead as reported by Resource Timing. `asset-sizes.json` separately records filesystem raw/gzip bytes for observed JavaScript/CSS assets; route entries can share assets and must not be summed. Screenshots and Playwright traces cover the excluded warm-up; all measured repetitions retain raw observations.",
);
await writeFile(join(directory, "report.md"), `${lines.join("\n")}\n`);
console.log(
	JSON.stringify({
		directory,
		measuredSamples: samples.length,
		comparisons: results.length,
	}),
);
