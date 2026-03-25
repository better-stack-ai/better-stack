import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";

function createManualInstructions(
	layoutPath: string,
	queryClientImportPath: string,
) {
	return [
		`Could not automatically patch ${layoutPath}.`,
		"Please apply this manually:",
		`1) Add imports:`,
		`   import { QueryClientProvider } from "@tanstack/react-query"`,
		`   import { getOrCreateQueryClient } from "${queryClientImportPath}"`,
		"2) Inside your root component, create:",
		"   const queryClient = getOrCreateQueryClient()",
		"3) Wrap your returned layout JSX with:",
		"   <QueryClientProvider client={queryClient}>...</QueryClientProvider>",
	].join("\n");
}

export async function patchLayoutWithQueryClientProvider(
	cwd: string,
	layoutPath: string,
	aliasPrefix: string,
): Promise<{ updated: boolean; warning?: string }> {
	const fullPath = join(cwd, layoutPath);
	const queryClientImportPath = `${aliasPrefix}lib/query-client`;

	let rawContent: string;
	try {
		rawContent = await readFile(fullPath, "utf8");
	} catch {
		return {
			updated: false,
			warning: createManualInstructions(layoutPath, queryClientImportPath),
		};
	}

	if (rawContent.includes("QueryClientProvider")) {
		return { updated: false };
	}

	try {
		const project = new Project({
			useInMemoryFileSystem: false,
			skipAddingFilesFromTsConfig: true,
		});
		const sourceFile = project.addSourceFileAtPath(fullPath);

		sourceFile.addImportDeclaration({
			moduleSpecifier: "@tanstack/react-query",
			namedImports: ["QueryClientProvider"],
		});
		sourceFile.addImportDeclaration({
			moduleSpecifier: queryClientImportPath,
			namedImports: ["getOrCreateQueryClient"],
		});

		const candidateFunctions = [
			...sourceFile.getFunctions(),
			...sourceFile
				.getVariableDeclarations()
				.map((decl) => decl.getInitializerIfKind(SyntaxKind.ArrowFunction))
				.filter((node): node is NonNullable<typeof node> => Boolean(node)),
		];

		let didPatch = false;
		for (const fn of candidateFunctions) {
			const body = fn.getBody();
			if (!body || !body.isKind(SyntaxKind.Block)) continue;
			const returnStatement = body
				.getStatements()
				.filter((s) => s.isKind(SyntaxKind.ReturnStatement))
				.at(-1);
			if (!returnStatement) continue;
			const expression = returnStatement.getExpression();
			if (!expression) continue;

			if (expression.getText().includes("QueryClientProvider")) {
				didPatch = true;
				break;
			}

			const hasQueryClientDeclaration = body
				.getStatements()
				.some((statement) =>
					statement.getText().includes("getOrCreateQueryClient()"),
				);
			if (!hasQueryClientDeclaration) {
				body.insertStatements(
					0,
					"const queryClient = getOrCreateQueryClient()",
				);
			}

			returnStatement.replaceWithText(
				`return (
		<QueryClientProvider client={queryClient}>
			${expression.getText()}
		</QueryClientProvider>
	)`,
			);
			didPatch = true;
			break;
		}

		if (!didPatch) {
			return {
				updated: false,
				warning: createManualInstructions(layoutPath, queryClientImportPath),
			};
		}

		await sourceFile.save();
		return { updated: true };
	} catch {
		return {
			updated: false,
			warning: createManualInstructions(layoutPath, queryClientImportPath),
		};
	}
}
