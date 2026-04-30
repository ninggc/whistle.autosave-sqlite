const CREATE_CONTEXT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS capture_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_key TEXT NOT NULL UNIQUE,
  scene TEXT,
  description TEXT,
  scene_mappings_json TEXT,
  filter_text TEXT,
  database_path TEXT,
  max_db_size_mb INTEGER,
  created_at INTEGER NOT NULL
)`;

const CREATE_CONTEXT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_capture_contexts_created_at
ON capture_contexts (created_at)`;

const normalizeText = (value) => {
  value = typeof value === 'string' ? value.trim() : '';
  return value || null;
};

const normalizeInteger = (value, defaultValue) => {
  value = Number(value);
  if (!Number.isFinite(value) || value < 1) {
    return defaultValue;
  }
  return Math.round(value);
};

const runStatement = (database, sql) => new Promise((resolve, reject) => {
  database.run(sql, (error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const getRow = (database, sql, params) => new Promise((resolve, reject) => {
  database.get(sql, params, (error, row) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(row || null);
  });
});

const insertRow = (database, sql, params) => new Promise((resolve, reject) => {
  database.run(sql, params, function(error) {
    if (error) {
      reject(error);
      return;
    }
    resolve(this.lastID);
  });
});

const ensureContextTable = (database) => runStatement(database, CREATE_CONTEXT_TABLE_SQL)
  .then(() => runStatement(database, CREATE_CONTEXT_INDEX_SQL));

const normalizeContext = (context) => ({
  scene: normalizeText(context && context.scene),
  description: normalizeText(context && context.description),
  sceneMappings: normalizeText(context && context.sceneMappings),
  filterText: normalizeText(context && context.filterText),
  databasePath: normalizeText(context && context.databasePath),
  maxDbSizeMB: normalizeInteger(context && context.maxDbSizeMB, 100),
});

const getContextKey = (context) => JSON.stringify([
  context.scene || '',
  context.description || '',
  context.sceneMappings || '',
  context.filterText || '',
  context.databasePath || '',
  context.maxDbSizeMB,
]);

const ensureContext = (database, context) => {
  const normalized = normalizeContext(context);
  const contextKey = getContextKey(normalized);

  return ensureContextTable(database).then(() => getRow(
    database,
    'SELECT id FROM capture_contexts WHERE context_key = ?',
    [contextKey]
  ).then((row) => {
    if (row && row.id) {
      return row.id;
    }

    return insertRow(
      database,
      `INSERT INTO capture_contexts (
        context_key,
        scene,
        description,
        scene_mappings_json,
        filter_text,
        database_path,
        max_db_size_mb,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contextKey,
        normalized.scene,
        normalized.description,
        normalized.sceneMappings,
        normalized.filterText,
        normalized.databasePath,
        normalized.maxDbSizeMB,
        Date.now(),
      ]
    );
  }));
};

module.exports = {
  ensureContextTable,
  ensureContext,
  normalizeContext,
};
