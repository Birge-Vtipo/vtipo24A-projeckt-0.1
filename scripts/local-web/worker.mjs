import worker from '../../cloudflare/cloud-worker.mjs';
import { BirgeCore } from '../../cloudflare/core.mjs';

// A new, local-only database starts empty. Never reset the data on restart.
export class LocalBirgeCore extends BirgeCore {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = this.ready.then(() => {
      this.db.prepare('INSERT OR IGNORE INTO cloud_meta(key,value) VALUES(?,?)')
        .run('import', JSON.stringify({ status: 'ready', sealed: true }));
    });
  }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'localhost') {
      return Response.redirect(env.PUBLIC_ORIGIN + url.pathname + url.search, 307);
    }
    if (url.origin !== env.PUBLIC_ORIGIN) return new Response(null, { status: 403 });
    return worker.fetch(request, env);
  },
};
