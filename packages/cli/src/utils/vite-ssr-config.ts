import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { FileWritePlanItem } from "../types";

export async function planViteSsrConfig(
	cwd: string,
): Promise<{ file?: FileWritePlanItem; warning?: string }> {
	const manual = {
		warning:
			'Could not safely patch Vite SSR configuration. Add ssr: { noExternal: ["lucide-react"] } to vite.config, preserving existing SSR settings and noExternal entries. This keeps each plugin\'s icon dependency consistent between server and browser.',
	};
	let path = "";
	let content = "";
	for (const extension of ["ts", "mts", "js", "mjs", "cts", "cjs"]) {
		try {
			path = `vite.config.${extension}`;
			content = await readFile(join(cwd, path), "utf8");
			break;
		} catch (error) {
			if (
				!(
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				)
			)
				throw error;
		}
	}
	if (!content) return manual;
	const project = new Project({
		useInMemoryFileSystem: true,
		skipAddingFilesFromTsConfig: true,
	});
	const source = project.createSourceFile(path, content);
	if (
		project
			.getProgram()
			.compilerObject.getSyntacticDiagnostics(source.compilerNode).length
	)
		return manual;
	let expression: Node | undefined = source
		.getExportAssignments()
		.find((item) => !item.isExportEquals())
		?.getExpression();
	if (expression && Node.isIdentifier(expression))
		expression = source
			.getVariableDeclaration(expression.getText())
			?.getInitializer();
	if (expression && Node.isCallExpression(expression)) {
		const defineConfigNames = source
			.getImportDeclarations()
			.filter((item) => item.getModuleSpecifierValue() === "vite")
			.flatMap((item) =>
				item
					.getNamedImports()
					.filter((item) => item.getName() === "defineConfig")
					.map((item) => item.getAliasNode()?.getText() ?? item.getName()),
			);
		if (
			!defineConfigNames.includes(expression.getExpression().getText()) ||
			expression.getArguments().length !== 1
		)
			return manual;
		expression = expression.getArguments()[0];
	}
	if (
		!expression ||
		!Node.isObjectLiteralExpression(expression) ||
		expression.getProperties().some(Node.isSpreadAssignment)
	)
		return manual;
	const ssrProperty = expression.getProperty("ssr");
	if (!ssrProperty) {
		expression.addPropertyAssignment({
			name: "ssr",
			initializer: '{ noExternal: ["lucide-react"] }',
		});
	} else {
		if (!Node.isPropertyAssignment(ssrProperty)) return manual;
		const ssr = ssrProperty.getInitializer();
		if (
			!ssr ||
			!Node.isObjectLiteralExpression(ssr) ||
			ssr.getProperties().some(Node.isSpreadAssignment)
		)
			return manual;
		const noExternal = ssr.getProperty("noExternal");
		if (!noExternal) {
			ssr.addPropertyAssignment({
				name: "noExternal",
				initializer: '["lucide-react"]',
			});
		} else {
			if (!Node.isPropertyAssignment(noExternal)) return manual;
			const value = noExternal.getInitializer();
			if (!value) return manual;
			if (value.getKind() === SyntaxKind.TrueKeyword) return {};
			if (Node.isArrayLiteralExpression(value)) {
				if (
					value
						.getElements()
						.some(
							(item) =>
								Node.isStringLiteral(item) &&
								item.getLiteralValue() === "lucide-react",
						)
				)
					return {};
				value.addElement('"lucide-react"');
			} else if (
				Node.isStringLiteral(value) ||
				value.getKind() === SyntaxKind.RegularExpressionLiteral
			) {
				if (
					Node.isStringLiteral(value) &&
					value.getLiteralValue() === "lucide-react"
				)
					return {};
				value.replaceWithText(`[${value.getText()}, "lucide-react"]`);
			} else if (value.getKind() === SyntaxKind.FalseKeyword) {
				value.replaceWithText('["lucide-react"]');
			} else return manual;
		}
	}
	return {
		file: {
			path,
			content: source.getFullText(),
			description: "Vite SSR dependency resolution",
		},
	};
}
