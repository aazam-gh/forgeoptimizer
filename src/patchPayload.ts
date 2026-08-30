export type PatchFile={path:string;content:string};
export type PatchPayload={files:PatchFile[];errors:string[]};

export function normalizePatchPayload(value:unknown,maxFiles=15,maxFileSize=1_000_000):PatchPayload{
  if(!Array.isArray(value))return{files:[],errors:['TrueForge patch payload must contain a files array']};
  const errors:string[]=[];const files:PatchFile[]=[];const seen=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object'){errors.push('Patch file entries must be objects');continue;}
    const candidate=item as Record<string,unknown>;const path=typeof candidate.path==='string'?candidate.path.trim():'';const content=typeof candidate.content==='string'?candidate.content:'';
    if(!path){errors.push('Patch file path is required');continue;}
    if(path.startsWith('/')||path.split('/').includes('..')||path.startsWith('.git/')){errors.push(`Unsafe patch file path: ${path}`);continue;}
    if(typeof candidate.content!=='string'||content.length>maxFileSize){errors.push(`Patch file is invalid or too large: ${path}`);continue;}
    if(seen.has(path)){errors.push(`Duplicate patch file: ${path}`);continue;}
    seen.add(path);files.push({path,content});
  }
  if(files.length>maxFiles)errors.push(`Patch contains ${files.length} files; maximum is ${maxFiles}`);
  return{files:files.slice(0,maxFiles),errors};
}
