const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const getSettings = require('./getSettings');
const { update: updateFilter } = require('../../filter');
const { ensureContextTable, ensureContext, normalizeContext } = require('../../contextDb');

const normalizeText = (value, maxLength) => {
  value = typeof value === 'string' ? value.trim() : '';
  if (maxLength && value.length > maxLength) {
    value = value.substring(0, maxLength);
  }
  return value;
};

const normalizeMaxDbSize = (value) => {
  value = normalizeText(value, 16);
  if (!value) {
    return '100';
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 10240) {
    return {
      ec: 11,
      em: '自动备份阈值请输入 1 到 10240 之间的整数，单位 MB',
    };
  }
  return String(Math.round(number));
};

const openDb = (databasePath) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(databasePath, (error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(db);
  });
});

const closeDb = (database) => new Promise((resolve, reject) => {
  database.close((error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const persistContext = (databasePath, context) => openDb(databasePath)
  .then((database) => ensureContextTable(database)
    .then(() => ensureContext(database, normalizeContext(context)))
    .then((contextId) => closeDb(database).then(() => contextId))
    .catch((error) => closeDb(database).catch(() => {}).then(() => Promise.reject(error))));

const parseSceneMappings = (text) => {
  text = normalizeText(text, 3072);
  if (!text) {
    return '';
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      ec: 6,
      em: '场景 JSON 格式不合法，请使用 [{"场景": "描述"}]',
    };
  }

  if (!Array.isArray(data)) {
    return {
      ec: 7,
      em: '场景 JSON 必须是数组，请使用 [{"场景": "描述"}]',
    };
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        ec: 8,
        em: '场景 JSON 的每一项都必须是对象',
      };
    }
    const keys = Object.keys(item);
    if (keys.length !== 1) {
      return {
        ec: 9,
        em: '场景 JSON 的每一项必须只有一个场景名和对应描述',
      };
    }
    const scene = normalizeText(keys[0], 256);
    const description = item[keys[0]];
    if (!scene || typeof description !== 'string') {
      return {
        ec: 10,
        em: '场景名和描述都必须是字符串',
      };
    }
  }

  return JSON.stringify(data);
};

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
  let { databasePath, filterText, scene, description, sceneMappings, maxDbSizeMB } = ctx.request.body;
  databasePath = normalizeText(databasePath, 3072);
  filterText = normalizeText(filterText, 3072);
  scene = normalizeText(scene, 256);
  description = normalizeText(description, 1024);
  const parsedSceneMappings = parseSceneMappings(sceneMappings);
  if (parsedSceneMappings && typeof parsedSceneMappings === 'object') {
    ctx.body = parsedSceneMappings;
    return;
  }
  maxDbSizeMB = normalizeMaxDbSize(maxDbSizeMB);
  if (maxDbSizeMB && typeof maxDbSizeMB === 'object') {
    ctx.body = maxDbSizeMB;
    return;
  }

  if (databasePath) {
    const result = await readStat(databasePath);
    if (result) {
      ctx.body = result;
      return;
    }
  }

  const { localStorage } = ctx.req;
  let currentContextId = null;
  if (databasePath) {
    try {
      currentContextId = await persistContext(databasePath, {
        scene,
        description,
        sceneMappings: parsedSceneMappings,
        filterText,
        databasePath,
        maxDbSizeMB,
      });
    } catch (error) {
      ctx.body = {
        ec: 12,
        em: '保存场景配置到 SQLite 失败，请稍后再试',
      };
      return;
    }
  }

  updateFilter(filterText);
  localStorage.setProperty('databasePath', databasePath);
  localStorage.setProperty('filterText', filterText || null);
  localStorage.setProperty('scene', scene || null);
  localStorage.setProperty('description', description || null);
  localStorage.setProperty('sceneMappings', parsedSceneMappings || null);
  localStorage.setProperty('maxDbSizeMB', maxDbSizeMB || '100');
  localStorage.setProperty('currentContextId', currentContextId || null);
  getSettings(ctx);
};
