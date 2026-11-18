import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import Module,{createRequire} from 'node:module';
import ts from 'typescript';
/** Test-only transpilation: exercise the real standalone component without a new app route. */
export function loadTsx(path){
 const file=resolve(path),compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(dirname(file));const native=createRequire(file);m.require=(name)=>{const target=resolve(dirname(file),name+'.tsx');return name.startsWith('.')&&existsSync(target)?loadTsx(target):native(name);};m._compile(compiled.outputText,file);return m.exports;
}
