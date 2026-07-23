import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const normalized = (fileName) => path.normalize(fileName);
const relative = (fileName) => path.relative(projectRoot, fileName).replaceAll(path.sep, '/');
const isWithin = (fileName, directory) => normalized(fileName).startsWith(`${normalized(directory)}${path.sep}`);
const isSourceFile = (fileName) => /\.(?:ts|tsx)$/.test(fileName) && !fileName.endsWith('.d.ts');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return isSourceFile(entryPath) ? [entryPath] : [];
  });
}

const compilerOptions = {
  baseUrl: projectRoot,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  paths: { '@/*': ['./src/webview/*'] },
  jsx: ts.JsxEmit.ReactJSX,
};

function resolveImport(specifier, containingFile) {
  const result = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys);
  return result.resolvedModule?.resolvedFileName && normalized(result.resolvedModule.resolvedFileName);
}

function featureLocation(fileName) {
  const match = relative(fileName).match(/^src\/webview\/features\/([^/]+)(?:\/(.*))?$/);
  return match && { name: match[1], segment: match[2] ?? '' };
}

function isPublicFeatureIndex(fileName) {
  const location = featureLocation(fileName);
  return Boolean(location && location.segment === 'index.ts');
}

const program = ts.createProgram(sourceFiles(sourceRoot), compilerOptions);
const typeChecker = program.getTypeChecker();
const diagramFeatureRoots = [
  path.join(sourceRoot, 'webview', 'features', 'flowchart'),
  path.join(sourceRoot, 'webview', 'features', 'class-diagram'),
];

function resolvedSymbol(symbol) {
  return symbol?.flags & ts.SymbolFlags.Alias ? typeChecker.getAliasedSymbol(symbol) : symbol;
}

function isDiagramFeatureType(symbol) {
  const resolved = resolvedSymbol(symbol);
  return Boolean(
    resolved &&
    resolved.flags & ts.SymbolFlags.Type &&
    resolved.declarations?.some((declaration) =>
      diagramFeatureRoots.some((featureRoot) => isWithin(declaration.getSourceFile().fileName, featureRoot)),
    ),
  );
}

function storeFacadeDomainExports(importDeclaration) {
  const moduleSymbol = typeChecker.getSymbolAtLocation(importDeclaration.moduleSpecifier);
  if (!moduleSymbol) return new Set();
  return new Set(
    typeChecker.getExportsOfModule(moduleSymbol)
      .filter(isDiagramFeatureType)
      .map((symbol) => symbol.name),
  );
}

function importsStoreFacadeDomainType(importDeclaration) {
  const clause = importDeclaration.importClause;
  if (!clause) return false;
  const domainExports = storeFacadeDomainExports(importDeclaration);
  if (domainExports.size === 0) return false;
  if (clause.name && domainExports.has('default')) return true;
  if (!clause.namedBindings) return false;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) =>
    domainExports.has((element.propertyName ?? element.name).text),
  );
}

function violationsForImport(fileName, importDeclaration) {
  const specifier = importDeclaration.moduleSpecifier.text;
  const target = resolveImport(specifier, fileName);
  const file = relative(fileName);
  const targetLabel = target ? relative(target) : specifier;
  const violations = [];
  const inShared = isWithin(fileName, path.join(sourceRoot, 'shared'));
  const inExtension = isWithin(fileName, path.join(sourceRoot, 'extension'));
  const feature = featureLocation(fileName);
  const targetFeature = target && featureLocation(target);
  const isRootState = target && isWithin(target, path.join(sourceRoot, 'webview', 'state'));
  const isStoreFacade = target === normalized(path.join(sourceRoot, 'webview', 'lib', 'store.ts'));
  const bannedSharedPackage = ['react', 'zustand'].some((packageName) =>
    specifier === packageName || specifier.startsWith(`${packageName}/`),
  ) || ['@xyflow/react', 'vscode'].includes(specifier);
  const targetsWebviewOrExtension = target && (
    isWithin(target, path.join(sourceRoot, 'webview')) ||
    isWithin(target, path.join(sourceRoot, 'extension'))
  );

  if (inShared && (bannedSharedPackage || targetsWebviewOrExtension)) {
    violations.push('shared code must not depend on UI, extension, or framework code');
  }

  if (feature?.segment.startsWith('domain/')) {
    const targetsUi = target && (
      /\/ui\//.test(target) ||
      isWithin(target, path.join(sourceRoot, 'webview', 'components'))
    );
    const targetsAnotherFeature = targetFeature && targetFeature.name !== feature.name;
    if (bannedSharedPackage || isRootState || targetsUi || targetsAnotherFeature) {
      violations.push('feature domain code must not depend on UI, root state, frameworks, or another feature');
    }
  }

  if (feature?.segment.startsWith('application/')) {
    const targetsAnotherFeaturePrivateFile = targetFeature &&
      targetFeature.name !== feature.name &&
      !isPublicFeatureIndex(target);
    if (isRootState || targetsAnotherFeaturePrivateFile) {
      violations.push('feature application code must not depend on root state or another feature private file');
    }
  }

  if (feature && targetFeature && feature.name !== targetFeature.name && !isPublicFeatureIndex(target)) {
    violations.push('features must import other features through their public index.ts');
  }

  if (isStoreFacade && importsStoreFacadeDomainType(importDeclaration)) {
    violations.push('flowchart or class domain types must not be imported from the store compatibility facade');
  }

  if (inExtension && target && isWithin(target, path.join(sourceRoot, 'webview'))) {
    violations.push('extension code must not import webview implementation files');
  }

  return violations.map((rule) => ({ file, target: targetLabel, rule }));
}

const violations = program.getSourceFiles()
  .filter((sourceFile) => isWithin(sourceFile.fileName, sourceRoot) && isSourceFile(sourceFile.fileName))
  .flatMap((sourceFile) => {
    const fileName = sourceFile.fileName;
    const imports = [];
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return imports.flatMap((importDeclaration) => violationsForImport(fileName, importDeclaration));
  });

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file} -> ${violation.target}: ${violation.rule}`);
  }
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries: PASS');
}
