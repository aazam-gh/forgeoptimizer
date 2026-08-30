export type BlastRadiusEvidence={callers:string[];imports:string[];exportedApi:boolean;dependentModules:string[];associatedTests:string[];sharedSchemas:boolean};
export type BlastRadiusAnalysis={score:number;level:'LOW'|'MEDIUM'|'HIGH';reasons:string[]};

export function analyzeBlastRadius(evidence:BlastRadiusEvidence):BlastRadiusAnalysis{
  const reasons:string[]=[];
  let score=0;
  if(evidence.exportedApi){score+=.45;reasons.push('exported API');}
  if(evidence.sharedSchemas){score+=.35;reasons.push('shared schema');}
  if(evidence.callers.length>3){score+=.15;reasons.push(`${evidence.callers.length} callers`);}else if(evidence.callers.length>1)score+=.08;
  if(evidence.dependentModules.length>3){score+=.15;reasons.push(`${evidence.dependentModules.length} dependent modules`);}else if(evidence.dependentModules.length>1)score+=.08;
  if(evidence.imports.length>4){score+=.1;reasons.push(`${evidence.imports.length} imports`);}
  const coverage=Math.min(1,evidence.associatedTests.length/Math.max(1,evidence.callers.length));
  if(coverage<.5)reasons.push('limited associated test coverage');
  const normalized=Number(Math.min(1,score).toFixed(3));
  return{score:normalized,level:normalized>=.6?'HIGH':normalized>=.25?'MEDIUM':'LOW',reasons};
}
