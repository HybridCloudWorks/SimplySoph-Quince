import { mkdir, writeFile } from 'node:fs/promises';
import { schemaClient } from '../server/notion-schema.mjs';

try {
  if (!process.env.NOTION_DATABASE_ID) throw new Error('Set NOTION_DATABASE_ID to the selected database ID or URL.');
  const report = await schemaClient({token:process.env.NOTION_TOKEN}).inspectDatabase(process.env.NOTION_DATABASE_ID);
  const folder = new URL('../work/notion/', import.meta.url);
  await mkdir(folder, {recursive:true});
  await writeFile(new URL('schema.json', folder), JSON.stringify(report, null, 2)+'\n', {mode:0o600});
  console.log(`Read-only schema saved privately to work/notion/schema.json (${report.dataSources.length} data sources). No guest rows read or changed.`);
} catch (error) {
  // No raw provider bodies or credential-bearing errors.
  console.error(error.message);
  process.exitCode = 1;
}
