'use strict';
// Presents just enough of the Firebase compat SDK surface that index.html uses,
// backed by a shared createBackend() instance. Multiple app windows can be given
// firebase mocks over the SAME backend to model multiple devices.
//
// Surface used by the app:
//   firebase.initializeApp(config)
//   firebase.firestore() -> { collection().doc().get()/.set(), collection().where().get(),
//                             batch().set()/.commit(), runTransaction(fn) }
//   firebase.auth() -> { signInWithEmailAndPassword, signOut, onAuthStateChanged }

function makeFirebase(backend) {
  function docRef(colName, id) {
    return {
      __col: colName,
      __id: id,
      async get() {
        const r = backend.getDoc(colName, id);
        return { exists: r.exists, id, data: () => r.data };
      },
      async set(data) {
        backend.setDoc(colName, id, data);
      },
      async delete() {
        backend.deleteDoc(colName, id);
      },
    };
  }

  function collectionRef(colName) {
    return {
      doc(id) {
        return docRef(colName, id);
      },
      where(field, op, value) {
        if (op !== '==') throw new Error('mock only supports == queries');
        return {
          async get() {
            const rows = backend.query(colName, field, value);
            return {
              forEach(cb) {
                rows.forEach((row) => cb({ id: row.id, data: () => row.data }));
              },
              get size() {
                return rows.length;
              },
            };
          },
        };
      },
    };
  }

  const firestore = {
    collection(name) {
      return collectionRef(name);
    },
    batch() {
      const ops = [];
      return {
        set(ref, data) {
          ops.push({ type: 'set', col: ref.__col, id: ref.__id, data });
        },
        delete(ref) {
          ops.push({ type: 'delete', col: ref.__col, id: ref.__id });
        },
        async commit() {
          backend.applyBatch(ops);
        },
      };
    },
    async runTransaction(updateFn) {
      // Optimistic-concurrency loop, mirroring Firestore: read versions, run the
      // caller's function, commit only if nothing we read has changed; retry on
      // conflict. Real backend errors (network/auth) propagate to the caller.
      for (let attempt = 0; attempt < 8; attempt++) {
        const reads = [];
        const writes = [];
        const tx = {
          async get(ref) {
            const r = await backend.txGet(ref.__col, ref.__id);
            reads.push({ col: ref.__col, id: ref.__id, version: r.version });
            return { exists: r.exists, id: ref.__id, data: () => r.data };
          },
          update(ref, patch) {
            writes.push({ col: ref.__col, id: ref.__id, data: patch, merge: true });
          },
          set(ref, data) {
            writes.push({ col: ref.__col, id: ref.__id, data, merge: false });
          },
        };
        const result = await updateFn(tx);
        const outcome = backend.commit(reads, writes);
        if (!outcome.conflict) return result;
        // else: someone else committed first - loop and retry with fresh reads
      }
      const e = new Error('transaction failed after retries (too much contention)');
      e.code = 'aborted';
      throw e;
    },
  };

  // Per-window auth session: independent of other windows sharing the backend.
  let currentUser = null;
  const authListeners = new Set();
  const auth = {
    async signInWithEmailAndPassword(email, password) {
      backend.checkCredentials(email, password);
      currentUser = { email };
      for (const cb of authListeners) cb(currentUser);
      return { user: currentUser };
    },
    async signOut() {
      currentUser = null;
      for (const cb of authListeners) cb(null);
    },
    onAuthStateChanged(cb) {
      authListeners.add(cb);
      Promise.resolve().then(() => cb(currentUser)); // async initial fire, like Firebase
      return () => authListeners.delete(cb);
    },
    get currentUser() {
      return currentUser;
    },
  };

  return {
    initializeApp() {
      return {};
    },
    firestore() {
      return firestore;
    },
    auth() {
      return auth;
    },
  };
}

module.exports = { makeFirebase };
