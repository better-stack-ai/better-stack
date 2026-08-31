#!/usr/bin/env node

import {
	parseArgs,
	runPackedConsumerSmoke,
} from "./packed-consumer/runner.mjs";

try {
	await runPackedConsumerSmoke(parseArgs(process.argv.slice(2)));
} catch (error) {
	console.error(`\n[packed-consumer] ${error.message}`);
	if (error.cause?.message)
		console.error(`[packed-consumer] ${error.cause.message}`);
	process.exitCode = 1;
}
