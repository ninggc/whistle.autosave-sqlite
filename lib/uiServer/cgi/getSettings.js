module.exports = (ctx) => {
  const { localStorage } = ctx.req;
  ctx.body = {
    ec: 0,
    active: localStorage.getProperty('active'),
    databasePath: localStorage.getProperty('databasePath'),
    filterText: localStorage.getProperty('filterText'),
  };
};
