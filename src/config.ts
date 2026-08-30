import type { OptimizationBudget, OptimizationPolicy } from './domain';
import { defaultOptimizationBudget } from './budget';
import { defaultOptimizationPolicy } from './v2';

export type OptimizationSettings={policy:OptimizationPolicy;budget:OptimizationBudget;requestsPerDay:number;maxCostPerRequest?:number;targetReductionPercent?:number};
export type PartialOptimizationSettings={policy?:Partial<OptimizationPolicy>;budget?:Partial<OptimizationBudget>;requestsPerDay?:number;maxCostPerRequest?:number;targetReductionPercent?:number};

export function validateSettings(settings:OptimizationSettings):string[]{const errors:string[]=[];if(!Number.isFinite(settings.requestsPerDay)||settings.requestsPerDay<0)errors.push('requestsPerDay must be a non-negative number');if(settings.maxCostPerRequest!==undefined&&(!Number.isFinite(settings.maxCostPerRequest)||settings.maxCostPerRequest<0))errors.push('maxCostPerRequest must be non-negative');if(settings.targetReductionPercent!==undefined&&(!Number.isFinite(settings.targetReductionPercent)||settings.targetReductionPercent<0||settings.targetReductionPercent>100))errors.push('targetReductionPercent must be between 0 and 100');for(const [key,value] of Object.entries(settings.budget)){if(!Number.isFinite(value)||value<0)errors.push(`budget.${key} must be non-negative`);}return errors;}

export function resolveOptimizationSettings(input:PartialOptimizationSettings={}):OptimizationSettings{const settings:OptimizationSettings={policy:{...defaultOptimizationPolicy,...input.policy},budget:{...defaultOptimizationBudget,...input.budget},requestsPerDay:input.requestsPerDay??0,maxCostPerRequest:input.maxCostPerRequest,targetReductionPercent:input.targetReductionPercent};const errors=validateSettings(settings);if(errors.length)throw new Error(`Invalid optimization settings: ${errors.join('; ')}`);return settings;}
