// DBML text -> @dbml/core's Database, without @dbml/core's Parser: that class loads the SQL parser of every dialect (about 300 MB of memory
// once loaded, a few MB this way). These are the steps of Parser.parse(text, 'dbmlv2') in @dbml/core 10.3, as in web/src/dbmlParse.js (a copy:
// the web build cannot reach the server's node_modules); server/test/dbmlParse.test.js checks both give the same result. The two inner
// modules are imported by file path: the package exports only its entry point.
import { Compiler, DEFAULT_ENTRY, MemoryProjectLayout } from '@dbml/parse';
import Database from '../node_modules/@dbml/core/lib/model_structure/database.mjs';
import { CompilerError } from '../node_modules/@dbml/core/lib/parse/error.mjs';

const diag = (e) => ({
  message: e.diagnostic, filepath: e.filepath.absolute, code: e.code,
  location: { start: { line: e.nodeOrToken.startPos.line + 1, column: e.nodeOrToken.startPos.column + 1 }, end: { line: e.nodeOrToken.endPos.line + 1, column: e.nodeOrToken.endPos.column + 1 } },
});

export function parseDbml(text) {
  try {
    const layout = new MemoryProjectLayout();
    layout.setSource(DEFAULT_ENTRY, text);
    const compiler = new Compiler(layout), errors = compiler.parse.errors(DEFAULT_ENTRY).map(diag);
    if (errors.length) throw CompilerError.create(errors);
    return new Database(compiler.parse.rawDb(DEFAULT_ENTRY));
  } catch (e) {
    throw CompilerError.create(e);
  }
}
