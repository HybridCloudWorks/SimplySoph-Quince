// Read-only: this client cannot query guest rows or create/update/delete anything.
export const notionVersion = '2025-09-03';
const origin = 'https://api.notion.com/v1/';
export function notionId(value) {
  if (typeof value !== 'string') throw new Error('Expected a Notion database ID or URL');
  let candidate = value;
  if (value.startsWith('https://')) {
    const url = new URL(value);
    if (!['notion.so', 'www.notion.so', 'notion.site', 'www.notion.site', 'notion.com', 'www.notion.com', 'app.notion.com'].includes(url.hostname)
      && !url.hostname.endsWith('.notion.site')) throw new Error('Expected a Notion URL');
    candidate = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  }
  const match = candidate.match(/(?:^|-)([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  if (!match) throw new Error('Expected a Notion database ID or URL');
  const hex = match[1].replaceAll('-', '').toLowerCase();
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export class NotionReadError extends Error {
  constructor(status, retryAfterSeconds = null) {
    super(`Notion schema read failed (status ${status}); check access or retry later.`);
    this.status = status; this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function schemaClient({token, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random}) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('Notion token is not configured');
  async function get(kind, id) {
    const url = origin + kind + '/' + notionId(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, {method:'GET', redirect:'error', signal:AbortSignal.timeout(10000),
          headers:{Authorization:`Bearer ${token}`, 'Notion-Version':notionVersion}});
      } catch { throw new NotionReadError(503); }
      let data;
      try { data = await res.json(); } catch { throw new NotionReadError(502); }
      if (res.ok) return data;
      const raw = res.headers.get('retry-after');
      const retryAfter = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
      const retryable = [429, 529, 500, 502, 503, 504].includes(res.status)
        && data?.additional_data?.rate_limit_reason !== 'public_api_request_blocked';
      // Long provider pauses belong in the future durable queue, not a short web request.
      if (!retryable || attempt === 2 || (retryAfter !== null && retryAfter > 10)) throw new NotionReadError(res.status, retryAfter);
      await sleep(Math.max(retryAfter ?? 0, 2 ** attempt) * 1000 + Math.floor(random()*250));
    }
  }
  return Object.freeze({
    async inspectDatabase(database) {
      const db = await get('databases', database);
      if (db.object !== 'database' || !Array.isArray(db.data_sources) || !db.data_sources.length || db.data_sources.length > 20) throw new Error('Notion database has no supported data-source metadata');
      const sources = [];
      for (const source of db.data_sources) {
        const metadata = await get('data_sources', source.id);
        if (metadata.object !== 'data_source' || !metadata.properties || Array.isArray(metadata.properties) || typeof metadata.properties !== 'object') throw new Error('Unexpected Notion data-source schema');
        sources.push({id:notionId(source.id), properties:Object.entries(metadata.properties).map(([name, p]) => ({
          name, id:p.id, type:p.type,
          ...(p.type === 'relation' ? {relatedDataSourceId:p.relation?.data_source_id ?? null} : {})
        }))});
      }
      // No titles, page blocks, descriptions, guest rows, or provider errors in output.
      return {version:notionVersion, databaseId:notionId(database), dataSources:sources};
    }
  });
}
