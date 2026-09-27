import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Ledger,cloudAdapter} from './store.mjs';
import {googleVerifier} from './auth.mjs';
import {notionClient} from './notion.mjs';
import {graphMailer} from './mail.mjs';
import {createApplication} from './application.mjs';
import {createHttpServer} from './http.mjs';
const env=process.env,origin=env.PUBLIC_ORIGIN||'https://misxv.simplysoph.com';
let app=null;
if(env.EVENT_BUCKET){
  const key=Buffer.from(env.APP_KEY||'','base64');if(key.length!==32||!env.NOTION_TOKEN||!env.NOTION_SOURCE_ID||!env.ADMIN_GOOGLE_CLIENT_ID||!env.ADMIN_EMAILS||!env.DATA_RETENTION_DATE||!env.SCOPED_NOTION_CONNECTION_CONFIRMED)throw new Error('Missing required production configuration; consult DEPLOYMENT.md');
  if(!/^https:\/\/[^/]+$/.test(origin))throw new Error('HTTPS origin required');
  const adapter=cloudAdapter(env.EVENT_BUCKET),adminEmails=env.ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase());
  app=createApplication({ledger:new Ledger(adapter),notion:notionClient({token:env.NOTION_TOKEN,sourceId:env.NOTION_SOURCE_ID}),mailer:graphMailer({tenant:env.M365_TENANT_ID,clientId:env.M365_CLIENT_ID,clientSecret:env.M365_CLIENT_SECRET,sender:'misxv@simplysoph.com'}),verifyGoogle:googleVerifier(env.ADMIN_GOOGLE_CLIENT_ID,adminEmails),media:{async put(id,bytes){await adapter.bucket.file('private/photos/'+id+'.jpg').save(bytes,{resumable:false,contentType:'image/jpeg',preconditionOpts:{ifGenerationMatch:0}});},async get(id){return (await adapter.bucket.file('private/photos/'+id+'.jpg').download())[0];}},key,origin,clientId:env.ADMIN_GOOGLE_CLIENT_ID,adminEmails});
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'),port=Number(env.PORT??4173),host=env.HOST??(env.K_SERVICE?'0.0.0.0':'127.0.0.1');
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port');
const server=createHttpServer({app,root,origin});server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>console.log(`Sophia ${app?'service':'preview'}: http://${host}:${server.address().port}/`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),8000).unref();});
