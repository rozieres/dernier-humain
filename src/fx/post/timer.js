export function createGpuTimer(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pool = [];
  const pending = [];
  const stats = { supported: Boolean(ext), samples: 0 };
  let current = null;

  return {
    enabled: false,
    stats,
    begin(label) {
      if (!this.enabled || !ext || current) return;
      const query = pool.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      current = { label, query };
    },
    end() {
      if (!current) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(current);
      current = null;
    },
    reset() {
      for (const k of Object.keys(stats)) if (k.endsWith('Ms')) delete stats[k];
      stats.samples = 0;
    },
    poll() {
      if (!ext) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const { label, query } = pending[0];
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        if (!disjoint) {
          const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          const key = `${label}Ms`;
          stats[key] = stats[key] === undefined ? ms : stats[key] * 0.9 + ms * 0.1;
          if (label === 'post') stats.samples++;
        }
        pool.push(query);
      }
    },
  };
}
