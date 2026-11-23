/**
 * three.js's Basis Universal transcoder, patched to run under the app's content
 * security policy (decision K7; record
 * docs/missions/01-architecture-decisions/earth-textures.md).
 *
 * The 8K Earth maps are KTX2 files. three.js's KTX2Loader turns them into what the
 * graphics card reads with this transcoder, run in a worker. Its Emscripten glue
 * builds two kinds of function by compiling code from strings: the invoker behind
 * every bound C++ function (craftInvokerFunction) and the caller behind every
 * JavaScript method the C++ side calls (__emval_get_method_caller). The policy in
 * vercel.json allows WebAssembly ('wasm-unsafe-eval') but not code compiled from
 * strings ('unsafe-eval'), and a worker made from a blob takes the page's policy.
 * On the live site the transcoder would have failed while starting, and the 8K maps
 * would have waited for it for ever. Allowing 'unsafe-eval' would have opened the
 * whole app to code compiled from strings, for one decoder.
 *
 * Emscripten has a form of both functions that compiles nothing (a build with
 * DYNAMIC_EXECUTION=0). The two below are that form, written to do exactly what the
 * compiled code does: the same checks, the same calls in the same order, with the
 * same receivers. The rest is three.js's file as it is.
 *
 * The patch is made only to the code it was written against. Each function is found
 * by where it starts and ends, and its text must hash to the one reviewed here, so a
 * three.js upgrade that changes either stops the patch until someone reads it again.
 * scripts/__tests__/basisTranscoderPatch.test.ts checks that the committed copy is
 * this patch of the installed three.js, and that it decodes the maps with code
 * generation from strings switched off, as the policy has it.
 */
import crypto from 'node:crypto';

/** three.js's transcoder, as installed. Its .wasm is used as it is. */
export const THREE_TRANSCODER = 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js';
/** The patched copy the app serves, imported by src/globe-engine/sharpEarthMaps.ts. */
export const PATCHED_TRANSCODER = 'src/assets/basis/basis_transcoder.js';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const CRAFT_INVOKER = [
  'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){',
  '  /* Patched (scripts/lib/basisTranscoderPatch.mjs): a closure doing what the invoker compiled from a string did. */',
  '  var argCount=argTypes.length;',
  '  if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and \'this\' types!")}',
  '  var isClassMethodFunc=argTypes[1]!==null&&classType!==null;',
  '  var needsDestructorStack=usesDestructorStack(argTypes);',
  '  var returns=argTypes[0].name!=="void";',
  '  var expectedArgCount=argCount-2;',
  '  var retType=argTypes[0];',
  '  var classParam=argTypes[1];',
  '  var paramTypes=argTypes.slice(2);',
  '  var dtorIndices=[];',
  '  var dtorFunctions=[];',
  '  if(!needsDestructorStack){',
  '    for(var i=isClassMethodFunc?1:2;i<argCount;++i){',
  '      if(argTypes[i].destructorFunction!==null){dtorIndices.push(i);dtorFunctions.push(argTypes[i].destructorFunction)}',
  '    }',
  '  }',
  '  var invokerFn=function(...args){',
  '    if(args.length!==expectedArgCount){throwBindingError("function "+humanName+" called with "+args.length+" arguments, expected "+expectedArgCount)}',
  '    var destructors=needsDestructorStack?[]:null;',
  '    var wired=new Array(argCount);',
  '    var invokerArgs=[cppTargetFunc];',
  '    if(isClassMethodFunc){wired[1]=classParam["toWireType"](destructors,this);invokerArgs.push(wired[1])}',
  '    for(var i=0;i<expectedArgCount;++i){wired[i+2]=paramTypes[i]["toWireType"](destructors,args[i]);invokerArgs.push(wired[i+2])}',
  '    var rv=cppInvokerFunc(...invokerArgs);',
  '    if(needsDestructorStack){runDestructors(destructors)}',
  '    else{for(var d=0;d<dtorFunctions.length;++d){var dtor=dtorFunctions[d];dtor(wired[dtorIndices[d]])}}',
  '    if(returns){return retType["fromWireType"](rv)}',
  '  };',
  '  Object.defineProperty(invokerFn,"length",{value:expectedArgCount});',
  '  return createNamedFunction(humanName,invokerFn)',
  '}',
].join('\n');

const METHOD_CALLER = [
  'var __emval_get_method_caller=(argCount,argTypes,kind)=>{',
  '  /* Patched (scripts/lib/basisTranscoderPatch.mjs): a closure doing what the caller compiled from a string did. */',
  '  var types=emval_lookupTypes(argCount,argTypes);',
  '  var retType=types.shift();',
  '  argCount--;',
  '  var offsets=[];',
  '  var offset=0;',
  '  for(var i=0;i<argCount;++i){offsets.push(offset);offset+=types[i]["argPackAdvance"]}',
  '  var returnsValue=!retType.isVoid;',
  '  var invokerFunction=function(obj,func,destructorsRef,args){',
  '    var argValues=new Array(argCount);',
  '    for(var i=0;i<argCount;++i){argValues[i]=types[i].readValueFromPointer(offsets[i]?args+offsets[i]:args)}',
  '    var rv=kind===1?new func(...argValues):kind===0?func.call(obj,...argValues):func.call(...argValues);',
  '    if(returnsValue){return emval_returnValue(retType,destructorsRef,rv)}',
  '  };',
  '  var functionName="methodCaller<("+types.map(t=>t.name).join(", ")+") => "+retType.name+">";',
  '  return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))',
  '};',
].join('\n');

/** What is replaced: found by its first and last text, checked against the hash of the code reviewed. */
export const REPLACEMENTS = [
  {
    name: 'craftInvokerFunction',
    start: 'function craftInvokerFunction(',
    end: 'return createNamedFunction(humanName,invokerFn)}',
    reviewed: '443e99caf19d681670f3170f32b3eb7d8e8af46ac50c635d87a8cb8a2e3b73e2',
    replacement: CRAFT_INVOKER,
  },
  {
    name: '__emval_get_method_caller',
    start: 'var __emval_get_method_caller=(argCount,argTypes,kind)=>{',
    end: 'return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};',
    reviewed: '22ef5fd14eac4e042d7422c5bcfc14ca873e83e299707f0d7a0216d78258c661',
    replacement: METHOD_CALLER,
  },
];

/** What compiles code from a string, none of which the patched copy may hold. */
export const STRING_COMPILATION = ['newFunc(Function', 'new Function(', 'eval('];

/** three.js's transcoder, `source`, with its two code-compiling functions replaced. Throws if either is not the code reviewed. */
export function patchBasisTranscoder(source, threeVersion) {
  let patched = source;
  for (const { name, start, end, reviewed, replacement } of REPLACEMENTS) {
    const from = patched.indexOf(start);
    if (from < 0 || patched.indexOf(start, from + 1) >= 0) {
      throw new Error(`${name}: the transcoder should hold "${start}" exactly once.`);
    }
    const last = patched.indexOf(end, from);
    if (last < 0) throw new Error(`${name}: no "${end}" after its start.`);
    const to = last + end.length;
    if (sha256(patched.slice(from, to)) !== reviewed) {
      throw new Error(`${name} is not the code this patch was written against. Read the new version and update `
        + 'scripts/lib/basisTranscoderPatch.mjs before using it.');
    }
    patched = patched.slice(0, from) + replacement + patched.slice(to);
  }
  const left = STRING_COMPILATION.filter((text) => patched.includes(text));
  if (left.length) throw new Error(`The patched transcoder still compiles code from strings: ${left.join(', ')}.`);
  return `/* three.js ${threeVersion}'s examples/jsm/libs/basis/basis_transcoder.js, patched to compile no code from `
    + 'strings (decision K7). Made by node scripts/patch-basis-transcoder.mjs: do not edit. */\n'
    + patched;
}
