import {Storage} from '@google-cloud/storage';
export const initialState=()=>({version:1,invitations:{},sessions:{},challenges:{},admins:{},responses:{},outbox:{},messages:{},photos:{},tables:{},announcements:{},limits:{},audit:[]});
export class Conflict extends Error {}
// One small event ledger; GCS generation preconditions serialize transactions across instances.
// Mutators must have NO external side effects: a conflicting transaction is retried.
export class Ledger {
  constructor(adapter){this.adapter=adapter;}
  async read(){return (await this.adapter.load()).state;}
  async transaction(fn){
    for(let attempt=0;attempt<8;attempt++){
      const {state,generation}=await this.adapter.load();
      const result=await fn(state);
      try{await this.adapter.save(state,generation);return result;}catch(e){if(!(e instanceof Conflict))throw e;}
    }
    throw Object.assign(new Error('Please retry.'),{status:503,code:'BUSY'});
  }
}
export function memoryAdapter(seed=initialState()){
  let value=structuredClone(seed),revision=0;
  return {async load(){return {state:structuredClone(value),generation:revision};},async save(state,generation){if(generation!==revision)throw new Conflict();value=structuredClone(state);revision++;}};
}
export function cloudAdapter(bucketName){
  if(!/^misxv-[a-z0-9-]+$/.test(bucketName||''))throw new Error('Dedicated event bucket required');
  const bucket=new Storage().bucket(bucketName),file=bucket.file('private/event-ledger.json');
  return {
    bucket,
    async load(){
      try{
        const [metadata]=await file.getMetadata();
        const [bytes]=await bucket.file(file.name,{generation:metadata.generation}).download();
        return {state:JSON.parse(bytes.toString()),generation:metadata.generation};
      }catch(e){if(e.code===404)return {state:initialState(),generation:0};throw e;}
    },
    async save(state,generation){
      const bytes=Buffer.from(JSON.stringify(state));
      if(bytes.length>20_000_000)throw new Error('Ledger size limit reached');
      try{await file.save(bytes,{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:generation},metadata:{cacheControl:'no-store'}});}
      catch(e){if(e.code===412)throw new Conflict();throw e;}
    }
  };
}
