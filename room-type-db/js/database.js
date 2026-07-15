/* =========================================================================
 * database.js — IndexedDB persistence layer
 * Stores: records (keyPath 'key'), batches (upload history + rollback data),
 * meta (schema version, misc). localStorage is used only for UI preferences.
 * ========================================================================= */
'use strict';

var DB = (function () {
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          db.createObjectStore(STORE_RECORDS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_BATCHES)) {
          db.createObjectStore(STORE_BATCHES, { keyPath: 'batchId' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return open().then(function (db) {
      return db.transaction(storeNames, mode);
    });
  }

  function getAll(storeName) {
    return tx([storeName], 'readonly').then(function (t) {
      return new Promise(function (resolve, reject) {
        var req = t.objectStore(storeName).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* Bulk write records + save batch in one transaction (atomic commit). */
  function commitBatch(records, batch) {
    return tx([STORE_RECORDS, STORE_BATCHES], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var store = t.objectStore(STORE_RECORDS);
        records.forEach(function (r) { store.put(r); });
        t.objectStore(STORE_BATCHES).put(batch);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  /* Rollback: delete added keys, restore previous versions of updated records. */
  function rollbackBatch(batch) {
    return tx([STORE_RECORDS, STORE_BATCHES], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var store = t.objectStore(STORE_RECORDS);
        (batch.addedKeys || []).forEach(function (k) { store.delete(k); });
        (batch.updatedPrev || []).forEach(function (prev) { store.put(prev); });
        batch.rolledBack = true;
        batch.rollbackTimestamp = new Date().toISOString();
        t.objectStore(STORE_BATCHES).put(batch);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  function getBatches() {
    return getAll(STORE_BATCHES).then(function (batches) {
      return batches.sort(function (a, b) {
        return a.timestamp < b.timestamp ? 1 : -1;
      });
    });
  }

  function clearAll() {
    return tx([STORE_RECORDS, STORE_BATCHES, STORE_META], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        t.objectStore(STORE_RECORDS).clear();
        t.objectStore(STORE_BATCHES).clear();
        t.objectStore(STORE_META).clear();
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /* Restore from JSON backup: replaces records and batches atomically. */
  function restoreBackup(records, batches) {
    return tx([STORE_RECORDS, STORE_BATCHES], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var rs = t.objectStore(STORE_RECORDS);
        var bs = t.objectStore(STORE_BATCHES);
        rs.clear();
        bs.clear();
        records.forEach(function (r) { rs.put(r); });
        (batches || []).forEach(function (b) { bs.put(b); });
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  return {
    open: open,
    getAllRecords: function () { return getAll(STORE_RECORDS); },
    getBatches: getBatches,
    commitBatch: commitBatch,
    rollbackBatch: rollbackBatch,
    clearAll: clearAll,
    restoreBackup: restoreBackup
  };
})();
