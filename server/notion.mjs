import {error} from './auth.mjs';
const version='2025-09-03';
const text=p=>(p?.title||p?.rich_text||[]).map(t=>t.plain_text??t.text?.content??'').join('');
export function normalizeInvitation(page){
  const p=page.properties??{},adults=p['Adults/Teens']?.number,kidsText=text(p.Kids).trim();
  const kids=/^\d{1,2}$/.test(kidsText)?Number(kidsText):null;
  const valid=Number.isInteger(adults)&&adults>=0&&kids!==null&&adults+kids>0&&adults+kids<=50;
  return {id:page.id,name:text(p.Guest),capacity:{adultsTeens:adults??null,kids},email:p.Email?.email??'',phone:p.Phone?.phone_number??'',role:p.Role?.select?.name??'',invitationStatus:p.RSVP?.select?.name??'',archived:page.archived||page.in_trash||false,validCapacity:valid,lastEdited:page.last_edited_time};
}
export const projectionSchema={
  'Website RSVP':{select:{options:[{name:'Attending',color:'green'},{name:'Declined',color:'red'}]}},
  'Website response ID':{rich_text:{}},'Website response at':{date:{}},
  'Ceremony adults':{number:{}},'Ceremony kids':{number:{}},'Dinner adults':{number:{}},'Dinner kids':{number:{}},'Dance adults':{number:{}},'Dance kids':{number:{}},
  'Website contact email':{email:{}},'Website phone':{phone_number:{}},'Website address':{rich_text:{}},'Website requests':{rich_text:{}}
};
export function notionClient({token,sourceId,fetchImpl=fetch}){
  async function call(path,method='GET',body){
    if(!token||!sourceId)throw error(503,'NOTION_NOT_CONFIGURED');
    let r;try{r=await fetchImpl('https://api.notion.com/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Notion-Version':version,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}catch{throw error(503,'NOTION_UNAVAILABLE');}
    if(!r.ok)throw error(503,`NOTION_${r.status}`);return r.json();
  }
  return {
    async list(){let cursor,rows=[];do{const r=await call(`data_sources/${sourceId}/query`,'POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});rows.push(...r.results.map(normalizeInvitation));cursor=r.has_more?r.next_cursor:null;if(rows.length>2000)throw error(422,'GUEST_LIMIT');}while(cursor);return rows;},
    async read(id){if(!/^[a-f0-9-]{36}$/.test(id))throw error(404,'INVITATION_NOT_FOUND');const p=await call('pages/'+id);if(p.parent?.data_source_id!==sourceId)throw error(403,'WRONG_DATA_SOURCE');return normalizeInvitation(p);},
    async schema(){return call('data_sources/'+sourceId);},
    async prepareSchema(){const current=await call('data_sources/'+sourceId);const properties={};for(const [name,spec] of Object.entries(projectionSchema)){if(current.properties[name]&&current.properties[name].type!==Object.keys(spec)[0])throw error(409,'SCHEMA_CONFLICT');if(!current.properties[name])properties[name]=spec;}if(Object.keys(properties).length)await call('data_sources/'+sourceId,'PATCH',{properties});return Object.keys(properties);},
    async project(id,response){
      await this.read(id);
      const a=response.attendance,r=(value)=>({rich_text:value?[{text:{content:value}}]:[]});
      const properties={'Website RSVP':{select:{name:Object.values(a).some(v=>v.adultsTeens+v.kids>0)?'Attending':'Declined'}},'Website response ID':r(response.id),'Website response at':{date:{start:response.submittedAt}},'Website contact email':{email:response.contact.email||null},'Website phone':{phone_number:response.contact.phone||null},'Website address':r(response.contact.address),'Website requests':r(response.requests)};
      for(const event of ['ceremony','dinner','dance']){const name=event[0].toUpperCase()+event.slice(1);properties[name+' adults']={number:a[event].adultsTeens};properties[name+' kids']={number:a[event].kids};}
      await call('pages/'+id,'PATCH',{properties});
    },
    async create(row){const kids=String(row.kids);const result=await call('pages','POST',{parent:{type:'data_source_id',data_source_id:sourceId},properties:{Guest:{title:[{text:{content:row.name}}]},'Adults/Teens':{number:row.adultsTeens},Kids:{rich_text:[{text:{content:kids}}]},Email:{email:row.email||null},Phone:{phone_number:row.phone||null}}});return normalizeInvitation(result);}
  };
}
