import { createLogicWorkshop, readWorkshopContent } from './logic-workshop.mjs';
import { createExperimentAdapter } from './logic-adapters.mjs';
import { runLogicMachine } from './logic-machine.mjs';
import { createMachineKernel } from './machine-kernel.mjs';
import { createDurableMachinePersistence } from './durable-machine-persistence.mjs';

export function createWorkshopRunner({ store, provider }) {
  const workshop = createLogicWorkshop({store,provider});
  return async ({work,actorRef='PIXIE'}) => {
    const reject = code => ({retryable:false,failure:{code},run:{workId:work.workId,checkpointId:work.checkpointId,executionState:'UNKNOWN',returnState:'UNKNOWN',verificationRef:null,returnRef:null,evidenceRefs:[]}});
    if(work.ownerDomain!=='LOGIC'||work.intent!=='LOGIC_WORKSHOP'||!work.scope?.includes('EXECUTE:LOGIC')) return reject('WORKSHOP_SCOPE_DENIED');
    if(work.inputRefs?.length!==1) return reject('WORKSHOP_COMMAND_REF_REQUIRED');
    let command;
    try { command=await readWorkshopContent(store,work.inputRefs[0]); } catch { return reject('WORKSHOP_COMMAND_REF_INVALID'); }
    let result;
    const pass=async()=>({status:'PASS',evidenceRef:work.inputRefs[0]});
    const adapter=createExperimentAdapter({
      designBench:pass,buildBench:pass,
      developmentBench:async()=>{
        result=await workshop.execute(command,work);
        return {status:result.status,evidenceRef:result.evidenceRef};
      },
      simulate:pass,runGoldenCases:pass,evaluate:pass,rca:pass,
      qualifyAgent:async()=>({status:'PASS',qualificationStatus:'PENDING_OWNER',evidenceRef:result.evidenceRef}),
      version:async()=>({status:'PASS',logicVersion:command.operationId,versionRef:result.output?.ref||result.evidenceRef}),
    });
    const machineWork={...work,machineId:'LOGIC-MACHINE',machineVersion:'0.1.0',domain:'LOGIC',
      ingress:{systemId:work.source.system,surfaceType:'STATION',surfaceId:work.source.stationId},
      destination:{systemId:work.target.system,surfaceType:'OWNER',surfaceId:'LOGIC',ownerDomain:'LOGIC'},
      transportRef:{kind:'RAIL',linkId:`${work.source.stationId}:${work.target.stationId}`,trustBoundaryRef:work.workPassRef},
      requestedBy:{actorId:work.actingActor,authorityRef:work.workPassRef,requestedAt:work.requestedAt},
      subject:{subjectId:command.subjectId,subjectType:'LOGIC_WORKSHOP_SUBJECT',ownerSystem:work.source.system,lifecycleAuthorityRef:work.workPassRef}};
    try {
      const execution=await runLogicMachine({kernel:createMachineKernel({persistence:createDurableMachinePersistence({store})}),adapter,work:machineWork,actorRef});
      return {...execution,workshopResult:result||null,retryable:false,...(execution.error?{failure:{code:result?.error?.code||execution.error.code}}:{})};
    } catch { return reject('WORKSHOP_EXECUTION_UNRECONCILED'); }
  };
}
