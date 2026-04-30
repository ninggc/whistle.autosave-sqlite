module.exports = (ctx) => {
  const { localStorage } = ctx.req;
  ctx.body = {
    ec: 0,
    active: localStorage.getProperty('active'),
    databasePath: localStorage.getProperty('databasePath'),
    filterText: localStorage.getProperty('filterText'),
    scene: localStorage.getProperty('scene'),
    description: localStorage.getProperty('description'),
    sceneMappings: localStorage.getProperty('sceneMappings'),
    maxDbSizeMB: localStorage.getProperty('maxDbSizeMB') || '100',
    currentContextId: localStorage.getProperty('currentContextId'),
  };
};
