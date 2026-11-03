// The browser release lives beside the API. Native builds retain app.json's
// configuration unless the dedicated web export explicitly enables this path.
module.exports = ({ config }) => {
  const basePath = process.env.BIRGE_WEB_BASE_PATH;
  if (!basePath) return config;
  if (basePath !== '/app') throw new Error('BIRGE_WEB_BASE_PATH must be /app.');
  return {
    ...config,
    experiments: { ...config.experiments, baseUrl: basePath },
    web: { ...config.web, output: 'single' },
  };
};
