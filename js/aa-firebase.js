/* AutoAlert — Firebase auth + family sync */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.fb = AA.fb || {};

  let _app = null;
  let _auth = null;
  let _db = null;
  let _user = null;
  let _unsubAuth = null;
  let _unsubFamily = null;
  let _state = {
    ready: false,
    configured: false,
    user: null,
    familyId: null,
    family: null,
    members: {},
    cars: {},
    offline: false
  };
  let _listeners = [];

  function emit() {
    _listeners.forEach(function (fn) {
      try { fn(AA.fb.getState()); } catch (e) { console.error(e); }
    });
  }

  function cfg() {
    return global.AA_FIREBASE_CONFIG;
  }

  AA.fb.isConfigured = function () {
    const c = cfg();
    return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY' && c.databaseURL);
  };

  AA.fb.onState = function (fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) { return f !== fn; });
    };
  };

  AA.fb.getState = function () {
    return {
      ready: _state.ready,
      configured: _state.configured,
      user: _state.user ? Object.assign({}, _state.user) : null,
      familyId: _state.familyId,
      family: _state.family ? Object.assign({}, _state.family) : null,
      members: Object.assign({}, _state.members),
      cars: JSON.parse(JSON.stringify(_state.cars || {})),
      offline: _state.offline,
      demo: _state.demo
    };
  };

  AA.fb._syncInviteIndex = function (familyId, inviteCode) {
    if (!_user || !_db || !AA.fb._api) return;
    if (!familyId || !inviteCode) return;
    if (!_state.family || _state.family.ownerUid !== _user.uid) return;
    const { ref, get, set } = AA.fb._api;
    const idxRef = ref(_db, 'inviteCodes/' + inviteCode);
    get(idxRef).then(function (snap) {
      if (!snap.exists() || snap.val() !== familyId) {
        return set(idxRef, familyId);
      }
    }).catch(function () {});
  };

  AA.fb._removeInviteIndex = async function (inviteCode) {
    if (!_db || !AA.fb._api || !inviteCode) return;
    const { ref, remove } = AA.fb._api;
    await remove(ref(_db, 'inviteCodes/' + inviteCode));
  };

  AA.fb._uniqueInviteCode = async function () {
    const { ref, get } = AA.fb._api;
    let code = AA.genInviteCode();
    let attempts = 0;
    while (attempts < 12) {
      const snap = await get(ref(_db, 'inviteCodes/' + code));
      if (!snap.exists()) return code;
      code = AA.genInviteCode();
      attempts++;
    }
    throw new Error('Nu s-a putut genera un cod unic. Încearcă din nou.');
  };

  AA.fb.init = async function () {
    if (!AA.fb.isConfigured()) {
      _state.configured = false;
      _state.ready = true;
      emit();
      return;
    }
    _state.configured = true;

    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
      getRedirectResult, signOut } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const { getDatabase, ref, get, set, update, remove, onValue, off, query, orderByChild, equalTo } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

    _app = initializeApp(cfg());
    _auth = getAuth(_app);
    _db = getDatabase(_app);

    AA.fb._api = { ref, get, set, update, remove, onValue, off, query, orderByChild, equalTo,
      GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut };

    try {
      await getRedirectResult(_auth);
    } catch (e) {
      console.warn('redirect result', e);
    }

    if (_unsubAuth) _unsubAuth();
    _unsubAuth = onAuthStateChanged(_auth, async function (user) {
      _user = user;
      _state.user = user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email || 'Utilizator'
      } : null;

      if (_unsubFamily) {
        off(_unsubFamily.ref);
        _unsubFamily = null;
      }

      if (!user) {
        _state.familyId = null;
        _state.family = null;
        _state.members = {};
        _state.cars = {};
        _state.ready = true;
        emit();
        return;
      }

      await AA.fb._loadUserFamily(user);
      _state.ready = true;
      emit();
    });
  };

  AA.fb._loadUserFamily = async function (user) {
    const { ref, get, onValue, off } = AA.fb._api;
    const snap = await get(ref(_db, 'users/' + user.uid + '/familyId'));
    const familyId = snap.exists() ? snap.val() : null;
    _state.familyId = familyId;

    if (!familyId) {
      _state.family = null;
      _state.members = {};
      _state.cars = {};
      emit();
      return;
    }

    const cached = AA.cacheLoad(familyId);
    if (cached) {
      _state.family = cached.family || null;
      _state.members = cached.members || {};
      _state.cars = cached.cars || {};
      emit();
    }

    const familyRef = ref(_db, 'families/' + familyId);
    if (_unsubFamily) off(_unsubFamily.ref);
    _unsubFamily = { ref: familyRef };

    onValue(familyRef, function (snapshot) {
      if (!snapshot.exists()) {
        _state.family = null;
        _state.members = {};
        _state.cars = {};
        emit();
        return;
      }
      const val = snapshot.val();
      _state.family = {
        name: val.name,
        inviteCode: val.inviteCode,
        ownerUid: val.ownerUid,
        createdAt: val.createdAt
      };
      _state.members = val.members || {};
      _state.cars = val.cars || {};
      _state.offline = false;
      AA.cacheSave(familyId, {
        family: _state.family,
        members: _state.members,
        cars: _state.cars
      });
      AA.fb._syncInviteIndex(familyId, val.inviteCode);
      emit();
    }, function (err) {
      console.error('RTDB error', err);
      _state.offline = true;
      emit();
    });
  };

  AA.fb._authErrorMsg = function (e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/operation-not-allowed': 'Google Sign-In nu e activat în Firebase Console (Authentication → Google → Enable).',
      'auth/unauthorized-domain': 'Domeniul nu e autorizat. Adaugă mferent80-source.github.io în Authentication → Settings.',
      'auth/popup-blocked': 'Popup blocat — încerc redirect…',
      'auth/popup-closed-by-user': 'Fereastra Google a fost închisă.',
      'auth/invalid-action': 'Acțiune invalidă — activează Google Sign-In și Identity Toolkit API în Google Cloud.'
    };
    if (map[code]) return map[code];
    const msg = (e && e.message) || '';
    if (/invalid/i.test(msg)) return 'Google Auth neconfigurat. Urmează pașii din FIX_GOOGLE_AUTH.txt';
    return msg || 'Eroare login Google';
  };

  AA.fb.signInGoogle = async function () {
    if (!_auth) throw new Error('Firebase neinițializat');
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = AA.fb._api;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(_auth, provider);
    } catch (e) {
      const code = e && e.code;
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' ||
          /invalid/i.test((e && e.message) || '')) {
        await signInWithRedirect(_auth, provider);
        return;
      }
      throw new Error(AA.fb._authErrorMsg(e));
    }
  };

  AA.fb.signOut = async function () {
    if (!_auth) return;
    await AA.fb._api.signOut(_auth);
  };

  AA.fb._writeUser = async function (uid, data) {
    const { ref, update } = AA.fb._api;
    await update(ref(_db, 'users/' + uid), data);
  };

  AA.fb._rtdbErr = function (e) {
    const msg = (e && e.message) || '';
    if (/PERMISSION_DENIED/i.test(msg) || (e && e.code === 'PERMISSION_DENIED')) {
      return 'Acces refuzat de regulile RTDB. Publică database.rules.json în Firebase Console (Realtime Database → Rules).';
    }
    if (/undefined/i.test(msg)) {
      return 'Date invalide (câmp undefined). Reîncarcă pagina cu Ctrl+Shift+R.';
    }
    return msg || 'Eroare Firebase';
  };

  AA.fb.createFamily = async function (name) {
    if (!_user) throw new Error('Neautentificat');
    const { ref, set } = AA.fb._api;
    const familyId = AA.genId();
    const code = await AA.fb._uniqueInviteCode();
    const now = Date.now();
    const familyData = {
      name: String(name || 'Familia mea').slice(0, 80),
      inviteCode: code,
      ownerUid: _user.uid,
      createdAt: now,
      members: {
        [_user.uid]: {
          role: 'owner',
          joinedAt: now,
          displayName: _state.user.displayName
        }
      },
      cars: {}
    };
    try {
      await set(ref(_db, 'families/' + familyId), familyData);
      await set(ref(_db, 'inviteCodes/' + code), familyId);
      await AA.fb._writeUser(_user.uid, {
        familyId: familyId,
        displayName: _state.user.displayName,
        email: _state.user.email || ''
      });
    } catch (e) {
      throw new Error(AA.fb._rtdbErr(e));
    }
    await AA.fb._loadUserFamily(_user);
    return { familyId: familyId, inviteCode: code };
  };

  AA.fb.joinFamily = async function (code) {
    if (!_user) throw new Error('Neautentificat');
    const { ref, get, update } = AA.fb._api;
    const normalized = String(code || '').trim().toUpperCase();
    if (normalized.length !== 6) throw new Error('Cod invalid');

    const idxSnap = await get(ref(_db, 'inviteCodes/' + normalized));
    if (!idxSnap.exists()) throw new Error('Cod negăsit');
    const familyId = idxSnap.val();
    if (!familyId) throw new Error('Cod negăsit');

    const famSnap = await get(ref(_db, 'families/' + familyId));
    if (!famSnap.exists()) throw new Error('Familie negăsită — cod expirat');

    try {
      await update(ref(_db, 'families/' + familyId + '/members/' + _user.uid), {
        role: 'member',
        joinedAt: Date.now(),
        displayName: _state.user.displayName
      });
      await AA.fb._writeUser(_user.uid, {
        familyId: familyId,
        displayName: _state.user.displayName,
        email: _state.user.email || ''
      });
    } catch (e) {
      throw new Error(AA.fb._rtdbErr(e));
    }
    await AA.fb._loadUserFamily(_user);
    return familyId;
  };

  AA.fb.leaveFamily = async function () {
    if (!_user || !_state.familyId) return;
    const { ref, remove } = AA.fb._api;
    const fid = _state.familyId;
    const isOwner = _state.family && _state.family.ownerUid === _user.uid;
    const inviteCode = _state.family ? _state.family.inviteCode : null;
    const memberIds = Object.keys(_state.members || {});

    if (isOwner) {
      if (inviteCode) {
        try { await AA.fb._removeInviteIndex(inviteCode); } catch (_) {}
      }
      await remove(ref(_db, 'families/' + fid));
      for (let i = 0; i < memberIds.length; i++) {
        await remove(ref(_db, 'users/' + memberIds[i] + '/familyId'));
      }
    } else {
      await remove(ref(_db, 'families/' + fid + '/members/' + _user.uid));
      await remove(ref(_db, 'users/' + _user.uid + '/familyId'));
    }
    localStorage.removeItem(AA.LS.cachePrefix + fid);
  };

  AA.fb.regenerateInvite = async function () {
    if (!_user || !_state.familyId) throw new Error('Fără familie');
    if (_state.family.ownerUid !== _user.uid) throw new Error('Doar owner-ul poate regenera codul');
    const { ref, set, update } = AA.fb._api;
    const oldCode = _state.family.inviteCode;
    const code = await AA.fb._uniqueInviteCode();
    if (oldCode) {
      try { await AA.fb._removeInviteIndex(oldCode); } catch (_) {}
    }
    await update(ref(_db, 'families/' + _state.familyId), { inviteCode: code });
    await set(ref(_db, 'inviteCodes/' + code), _state.familyId);
    return code;
  };

  AA.fb.removeMember = async function (uid) {
    if (!_user || !_state.familyId) throw new Error('Fără familie');
    if (_state.family.ownerUid !== _user.uid) throw new Error('Doar owner-ul poate elimina membri');
    if (uid === _user.uid) throw new Error('Nu te poți elimina pe tine');
    const { ref, remove } = AA.fb._api;
    await remove(ref(_db, 'families/' + _state.familyId + '/members/' + uid));
    await remove(ref(_db, 'users/' + uid + '/familyId'));
  };

  AA.fb.updateFamilyData = async function (path, data) {
    if (!_user || !_state.familyId) throw new Error('Fără familie');
    const { ref, update } = AA.fb._api;
    const payload = Object.assign({}, data);
    const nested = /\/services\//.test(path) || /\/history\//.test(path);
    payload.updatedAt = Date.now();
    if (!nested) payload.updatedBy = _user.uid;
    const clean = AA.cleanRtdb(payload);
    if (!clean || typeof clean !== 'object') throw new Error('Payload Firebase invalid');
    await update(ref(_db, 'families/' + _state.familyId + '/' + path), clean);
  };

  AA.fb.set = async function (path, data) {
    if (!_user || !_state.familyId) throw new Error('Fără familie');
    const { ref, set } = AA.fb._api;
    const clean = AA.cleanRtdb(data);
    if (!clean || typeof clean !== 'object') throw new Error('Payload Firebase invalid');
    await set(ref(_db, 'families/' + _state.familyId + '/' + path), clean);
  };

  AA.fb.remove = async function (path) {
    if (!_user || !_state.familyId) throw new Error('Fără familie');
    const { ref, remove } = AA.fb._api;
    await remove(ref(_db, 'families/' + _state.familyId + '/' + path));
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);