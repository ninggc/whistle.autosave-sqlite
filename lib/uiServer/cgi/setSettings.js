const fs = require('fs');
const path = require('path');
const getSettings = require('./getSettings');
const { update: updateFilter } = require('../../filter');

const readStat = (databasePath) => {
  return new Promise((resolve) => {
    const parentDir = path.dirname(databasePath);

    fs.stat(databasePath, (fileErr, fileStat) => {
      if (!fileErr) {
        if (fileStat.isDirectory()) {
          return resolve({
            ec: 3,
            em: '路径不能是目录，请填写 SQLite 文件路径',
          });
        }
        return resolve();
      }
      if (fileErr.code && fileErr.code !== 'ENOENT') {
        return resolve({
          ec: 2,
          em: '系统异常，请稍后再试',
        });
      }

      fs.stat(parentDir, (dirErr, dirStat) => {
        if (dirErr) {
          return resolve({
            ec: 4,
            em: dirErr.code === 'ENOENT' ? '数据库文件所在目录不存在，请手动创建' : '系统异常，请稍后再试',
          });
        }
        if (!dirStat.isDirectory()) {
          return resolve({
            ec: 5,
            em: '数据库文件所在路径不是目录',
          });
        }
        resolve();
      });
    });
  });
};

module.exports = async (ctx) => {
  let { databasePath, filterText } = ctx.request.body;
  if (typeof databasePath !== 'string') {
    databasePath = '';
  }
  databasePath = databasePath.trim();
  if (databasePath) {
    const result = await readStat(databasePath);
    if (result) {
      ctx.body = result;
      return;
    }
  }
  const { localStorage } = ctx.req;
  updateFilter(filterText);
  localStorage.setProperty('databasePath', databasePath);
  localStorage.setProperty('filterText', typeof filterText === 'string' ? filterText : null);
  getSettings(ctx);
};
