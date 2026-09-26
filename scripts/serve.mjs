import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const port=Number(process.env.PORT ?? 4173);
const host=process.env.HOST ?? (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be a valid integer port.');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/healthz'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',mode:'preview'}));
    }
    let target=path.resolve(root,'.'+pathname);
    if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    let code=200;
    try {const info=await stat(target);if(info.isDirectory())target=path.join(target,'index.html');await stat(target);}catch{target=path.join(root,'404.html');code=404;}
    const data=await readFile(target);
    res.writeHead(code,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(400);res.end('Unable to serve this request. Run npm run build first.');}
});
server.listen(port,host,()=>console.log(`Sophia preview: http://${host}:${server.address().port}/`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),8000).unref();
});
