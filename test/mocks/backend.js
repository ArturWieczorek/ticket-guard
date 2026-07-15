'use strict';
// Authoritative in-memory Firestore stand-in, shared by one or more app windows.
// Implements genuine optimistic concurrency: every doc carries a version, and a
// transaction commit only succeeds if the versions it read are still current.
// This is what lets us prove the "two phones scan the same ticket" guarantee for
// real rather than by inspection. Node is single-threaded, so commit() is atomic.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function codedError(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function createBackend() {
  // colName -> Map(docId -> { data, version })
  const collections = new Map();
  const authUsers = new Map(); // email -> password (shared user directory)

  const state = {
    // Firestore failure injection: null | 'network' | 'auth'
    failMode: null,
    // ms awaited inside a transaction read, used to force interleaving in tests
    txReadDelay: 0,
    // counters for assertions
    commitAttempts: 0,
    commitConflicts: 0,
  };

  function col(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function guardFirestore() {
    if (state.failMode === 'network') throw codedError('backend unavailable', 'unavailable');
    if (state.failMode === 'auth') throw codedError('permission denied', 'permission-denied');
  }

  return {
    state,

    // ---- direct doc ops (non-transactional) ----
    getDoc(colName, id) {
      guardFirestore();
      const rec = col(colName).get(id);
      return rec
        ? { exists: true, data: { ...rec.data }, version: rec.version }
        : { exists: false, data: null, version: 0 };
    },

    setDoc(colName, id, data) {
      guardFirestore();
      const c = col(colName);
      const prev = c.get(id);
      c.set(id, { data: { ...data }, version: (prev ? prev.version : 0) + 1 });
    },

    batchSet(writes) {
      guardFirestore();
      // atomic: apply all or (on guard throw) none
      for (const w of writes) {
        const c = col(w.col);
        const prev = c.get(w.id);
        c.set(w.id, { data: { ...w.data }, version: (prev ? prev.version : 0) + 1 });
      }
    },

    // A batch of mixed set/delete ops applied atomically.
    applyBatch(ops) {
      guardFirestore();
      for (const o of ops) {
        const c = col(o.col);
        if (o.type === 'delete') {
          c.delete(o.id);
        } else {
          const prev = c.get(o.id);
          c.set(o.id, { data: { ...o.data }, version: (prev ? prev.version : 0) + 1 });
        }
      }
    },

    deleteDoc(colName, id) {
      guardFirestore();
      col(colName).delete(id);
    },

    query(colName, field, value) {
      guardFirestore();
      const out = [];
      for (const [id, rec] of col(colName)) {
        if (rec.data[field] === value) out.push({ id, data: { ...rec.data } });
      }
      return out;
    },

    // ---- transactional read used by runTransaction (may await to force races) ----
    async txGet(colName, id) {
      guardFirestore();
      // Capture the version NOW, then (optionally) linger before returning. This
      // widens the window BETWEEN read and commit so concurrent transactions
      // genuinely overlap - the delay must not sit before the read, or the two
      // transactions just serialize and never contend.
      const rec = col(colName).get(id);
      const snap = rec
        ? { exists: true, data: { ...rec.data }, version: rec.version }
        : { exists: false, data: null, version: 0 };
      if (state.txReadDelay > 0) await delay(state.txReadDelay);
      return snap;
    },

    // ---- transactional commit: succeeds only if every read is still current ----
    commit(reads, writes) {
      guardFirestore();
      state.commitAttempts++;
      for (const r of reads) {
        const rec = col(r.col).get(r.id);
        const current = rec ? rec.version : 0;
        if (current !== r.version) {
          state.commitConflicts++;
          return { conflict: true };
        }
      }
      for (const w of writes) {
        const c = col(w.col);
        const prev = c.get(w.id);
        const base = w.merge && prev ? prev.data : {};
        c.set(w.id, { data: { ...base, ...w.data }, version: (prev ? prev.version : 0) + 1 });
      }
      return { conflict: false };
    },

    // ---- auth ----
    // The user directory is shared (one Firebase project), but each app window
    // holds its OWN session (see firebase-mock.js). This mirrors real devices:
    // one phone signing in must not fire another phone's auth callback.
    addUser(email, password) {
      authUsers.set(email, password);
    },
    checkCredentials(email, password) {
      // Auth is independent of Firestore reachability: a librarian can be signed
      // in while the database rejects reads (rules issue) or is unreachable.
      if (!authUsers.has(email) || authUsers.get(email) !== password) {
        throw codedError(
          'The password is invalid or the user does not exist.',
          'auth/invalid-credential',
        );
      }
      return true;
    },

    // ---- test controls ----
    setFailMode(mode) {
      state.failMode = mode;
    },
    setTxReadDelay(ms) {
      state.txReadDelay = ms;
    },
    dump(colName) {
      const out = {};
      for (const [id, rec] of col(colName)) out[id] = { ...rec.data, __v: rec.version };
      return out;
    },
    reset() {
      collections.clear();
      authUsers.clear();
      state.failMode = null;
      state.txReadDelay = 0;
      state.commitAttempts = 0;
      state.commitConflicts = 0;
    },
  };
}

module.exports = { createBackend };
