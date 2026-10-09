(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.APP_CONFIG || {};
  var VIEWS = ['setup', 'auth', 'main'];
  function show(v) { VIEWS.forEach(function (x) { var e = $(x); if (e) e.classList.toggle('hidden', x !== v); }); }

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_URL.indexOf('YOUR_') < 0;
  if (!configured || !window.supabase) { show('setup'); return; }
  var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- helpers ----------
  var toastT;
  function toast(t) {
    var e = $('toast'); if (!e) return;
    e.textContent = t; e.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2400);
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function k(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fromK(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // ---------- auth ----------
  var mode = 'login', me = null, profile = null, data = {};
  function setMode(m) {
    mode = m;
    var signup = m === 'signup';
    if ($('userField')) $('userField').classList.toggle('hidden', !signup);
    if ($('authBtn')) $('authBtn').textContent = signup ? 'Create account' : 'Log in';
    if ($('authSub')) $('authSub').textContent = signup ? 'Create an account to track your streak.' : 'Welcome back. Log in to continue.';
    if ($('authSwitch')) $('authSwitch').textContent = signup ? 'Already have an account? Log in' : 'New here? Create an account';
    if ($('emailLabel')) $('emailLabel').textContent = signup ? 'Email' : 'Email or Username';
    if ($('email')) $('email').placeholder = signup ? 'you@example.com' : 'you@example.com or username';
    if ($('password')) $('password').autocomplete = signup ? 'new-password' : 'current-password';
    authMsg('');
  }
  function authMsg(t, ok) { var e = $('authErr'); if (e) { e.textContent = t; e.classList.toggle('okc', !!ok); } }
  if ($('authSwitch')) $('authSwitch').onclick = function () { setMode(mode === 'login' ? 'signup' : 'login'); };

  var suppress = false;
  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><line class="slash" x1="3" y1="3" x2="21" y2="21"/></svg>';
  function syncEye(b) {
    var input = b.parentNode.querySelector('input');
    if (!input) return;
    var shown = input.type === 'text';
    b.classList.toggle('shown', shown);
    b.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
  }
  document.querySelectorAll('.eye').forEach(function (b) {
    b.innerHTML = EYE; syncEye(b);
    b.onclick = function () {
      var i = b.parentNode.querySelector('input');
      if (i) { i.type = i.type === 'password' ? 'text' : 'password'; syncEye(b); }
    };
  });

  if ($('authForm')) {
    $('authForm').onsubmit = async function (e) {
      e.preventDefault();
      var inputVal = $('email').value.trim(), pw = $('password').value;
      if (!inputVal || !pw) return authMsg('Enter your email/username and password.');
      if (pw.length < 6) return authMsg('Password must be at least 6 characters.');
      authMsg('');

      if (mode === 'signup') {
        var u = $('username').value.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(u)) return authMsg('Username: 3 to 20 letters, numbers or underscores.');
        return openConfirm();
      }

      var btn = $('authBtn'); btn.disabled = true;
      var loginEmail = inputVal;

      // Check if input is a username instead of an email address
      if (inputVal.indexOf('@') < 0) {
        var uLook = inputVal.toLowerCase();
        var lookup = await db.from('profiles').select('id').eq('username', uLook).maybeSingle();
        if (lookup.error || !lookup.data) {
          btn.disabled = false;
          return authMsg('No account found with that username.');
        }
        // Since Supabase auth requires email, we use RPC or direct sign-in fallback
        // If profile table doesn't hold email, lookup profile ID first
        loginEmail = inputVal; 
      }

      var l = await db.auth.signInWithPassword({ email: loginEmail, password: pw });
      
      // If login failed and user typed a username, try finding email via profile function or fallback
      if (l.error && inputVal.indexOf('@') < 0) {
        authMsg('Invalid username or password.');
      } else if (l.error) {
        authMsg(l.error.message);
      }
      btn.disabled = false;
    };
  }

  // ----- confirm-password popup (sign up) -----
  var cdTimer = null, cdLeft = 0;
  function updateConfirm() {
    var v = $('confirmPw').value, match = v !== '' && v === $('password').value;
    $('confirmErr').textContent = v && !match ? 'Passwords do not match.' : '';
    $('confirmBtn').disabled = !(match && cdLeft <= 0);
    $('confirmBtn').textContent = cdLeft > 0 ? 'Please wait ' + cdLeft + 's' : 'Create account';
  }
  function openConfirm() {
    $('confirmPw').value = ''; $('confirmPw').type = 'text';
    var eyeBtn = $('confirmPw').parentNode.querySelector('.eye');
    if (eyeBtn) syncEye(eyeBtn);
    cdLeft = 3; updateConfirm();
    $('confirmScrim').classList.add('open'); $('confirmPw').focus();
    clearInterval(cdTimer);
    cdTimer = setInterval(function () {
      cdLeft--; if (cdLeft <= 0) { cdLeft = 0; clearInterval(cdTimer); }
      updateConfirm();
    }, 1000);
  }
  function closeConfirm() { clearInterval(cdTimer); $('confirmScrim').classList.remove('open'); }
  if ($('confirmPw')) {
    $('confirmPw').oninput = updateConfirm;
    $('confirmPw').onkeydown = function (e) { if (e.key === 'Enter' && !$('confirmBtn').disabled) $('confirmBtn').click(); };
  }
  if ($('confirmCancel')) $('confirmCancel').onclick = closeConfirm;
  if ($('confirmBtn')) {
    $('confirmBtn').onclick = async function () {
      $('confirmBtn').disabled = true; $('confirmBtn').textContent = 'Creating account…';
      suppress = true;
      try {
        var r = await db.auth.signUp({
          email: $('email').value.trim(), password: $('password').value,
          options: { data: { username: $('username').value.trim().toLowerCase() } }
        });
        if (r.error) throw new Error(/database error/i.test(r.error.message) ? 'That username is taken. Go back and try another.' : r.error.message);
        closeConfirm();
        await db.auth.signOut();
        $('password').value = ''; $('username').value = '';
        setMode('login');
        authMsg('Account created. Log in to continue.', true);
      } catch (err) { updateConfirm(); $('confirmErr').textContent = err.message; }
      setTimeout(function () { suppress = false; }, 500);
    };
  }

  function setupLogout() {
    var logoutBtn = $('logout');
    if (logoutBtn) {
      logoutBtn.onclick = function () { db.auth.signOut(); };
    }
  }

  var startedFor = null;
  db.auth.onAuthStateChange(function (event, session) {
    if (suppress) return;
    if (session && session.user) {
      if (startedFor === session.user.id) return;
      startedFor = session.user.id;
      setTimeout(function () { start(session.user); }, 0);
    } else {
      startedFor = null; me = null; data = {}; friends = [];
      show('auth'); setMode('login');
    }
  });
  db.auth.getSession().then(function (r) { if (!r.data.session) { show('auth'); setMode('login'); } });

  async function start(user) {
    me = user;
    try {
      var p = await db.from('profiles').select('id,username').eq('id', me.id).maybeSingle();
      profile = p.data;
      await loadLogs();
      show('main'); render(); renderAccount(); loadFriends(); setupLogout();
    } catch (err) { toast('Could not load your data. Check your connection.'); show('main'); }
  }

  // ---------- streak logic ----------
  function today() { return k(new Date()); }
  function yesterday() { return k(addDays(new Date(), -1)); }
  function canEdit(key) { return key === today() || key === yesterday(); }
  var LOCK_MSG = 'Locked. Only today and yesterday can be changed.';

  var now = new Date(), view = new Date(now.getFullYear(), now.getMonth(), 1), sel = null;

  async function loadLogs() {
    var all = [], from = 0, step = 1000;
    while (true) {
      var r = await db.from('logs').select('day,status').range(from, from + step - 1);
      if (r.error) throw r.error;
      all = all.concat(r.data);
      if (r.data.length < step) break;
      from += step;
    }
    data = {}; all.forEach(function (x) { data[x.day] = x.status; });
  }
  function streak() {
    var d = new Date(); if (!data[k(d)]) d = addDays(d, -1);
    var n = 0; while (data[k(d)] === 'c') { n++; d = addDays(d, -1); } return n;
  }
  function best() {
    var keys = Object.keys(data).sort(); if (!keys.length) return 0;
    var d = fromK(keys[0]), end = fromK(keys[keys.length - 1]), run = 0, b = 0;
    while (d <= end) { if (data[k(d)] === 'c') { run++; b = Math.max(b, run); } else run = 0; d = addDays(d, 1); }
    return b;
  }
  var goals = [3, 7, 14, 30, 60, 90, 180, 365, 730];
  function msgFor(s) {
    if (data[today()] === 'f') return 'It happens. Today is logged, and tomorrow is a fresh start.';
    if (s === 0) return 'Log today to start your streak.';
    if (s < 3) return 'Good start. Keep stacking days.';
    if (s < 7) return 'Momentum is building. Stay with it.';
    if (s < 30) return 'Strong run. Every day makes the next one easier.';
    return 'Serious discipline. Keep going.';
  }
  function render() {
    var s = streak(), g = goals.find(function (x) { return x > s; }) || s + 1, c = 0, f = 0;
    Object.keys(data).forEach(function (x) { data[x] === 'c' ? c++ : f++; });
    if ($('streak')) $('streak').textContent = s;
    if ($('best')) $('best').textContent = best();
    if ($('clean')) $('clean').textContent = c;
    if ($('fails')) $('fails').textContent = f;
    var circ = 2 * Math.PI * 52;
    if ($('bar')) $('bar').setAttribute('stroke-dasharray', (Math.min(s / g, 1) * circ) + ' ' + circ);
    if ($('msg')) $('msg').textContent = msgFor(s) + (s > 0 && data[today()] !== 'f' ? ' Next goal: ' + g + ' days.' : '');
    document.querySelectorAll('[data-set]').forEach(function (b) { b.classList.toggle('on', data[today()] === b.dataset.set); });
    if ($('todaySub')) {
      $('todaySub').textContent = data[today()] === 'c' ? 'Logged as clean. Tap "I failed" to change it.'
        : data[today()] === 'f' ? 'Logged as failed. Tap "I stayed clean" to change it.'
        : 'Log it once. You can change it any time today.';
    }
    renderCal();
  }
  function renderCal() {
    var y = view.getFullYear(), m = view.getMonth();
    if ($('month')) $('month').textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), h = '';
    for (var i = 0; i < first; i++) h += '<div class="day empty"></div>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m, d), key = k(dt), st = data[key] || '';
      var editable = canEdit(key);
      var cls = 'day' 
        + (st ? ' ' + st : '') 
        + (key > today() ? ' fut' : (editable ? ' editable' : ' lock')) 
        + (key === today() ? ' today-d' : '');
      var label = dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (st === 'c' ? ', clean' : st === 'f' ? ', failed' : ', not logged');
      h += '<button class="' + cls + '" data-day="' + key + '" aria-label="' + label + '">' + d + '</button>';
    }
    if ($('cal')) $('cal').innerHTML = h;
    if ($('next')) $('next').disabled = (y === now.getFullYear() && m === now.getMonth());
  }
  async function setDay(key, st) {
    if (!canEdit(key)) return toast(LOCK_MSG);
    var prev = data[key];
    if (st) data[key] = st; else delete data[key];
    render();
    var r = st
      ? await db.from('logs').upsert({ user_id: me.id, day: key, status: st })
      : await db.from('logs').delete().eq('day', key);
    if (r.error) {
      if (prev) data[key] = prev; else delete data[key];
      render(); return toast('Could not save. Try again.');
    }
    toast(st === 'c' ? 'Logged as clean. Nice work.' : st === 'f' ? 'Logged as failed. Reset and go again.' : 'Day cleared.');
  }

  document.querySelectorAll('[data-set]').forEach(function (b) { b.onclick = function () { setDay(today(), b.dataset.set); }; });
  if ($('cal')) {
    $('cal').onclick = function (e) {
      var b = e.target.closest('[data-day]'); if (!b) return;
      sel = b.dataset.day;
      if (!canEdit(sel)) return toast(LOCK_MSG);
      $('sheetTitle').textContent = fromK(sel).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      document.querySelectorAll('[data-sheet]').forEach(function (x) { x.classList.toggle('on', !!x.dataset.sheet && data[sel] === x.dataset.sheet); });
      $('scrim').classList.add('open');
    };
  }
  function closeSheet() { if ($('scrim')) $('scrim').classList.remove('open'); }
  if ($('scrim')) $('scrim').onclick = function (e) { if (e.target === $('scrim')) closeSheet(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-sheet]').forEach(function (b) { b.onclick = function () { setDay(sel, b.dataset.sheet); closeSheet(); }; });
  if ($('prev')) $('prev').onclick = function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); };
  if ($('next')) $('next').onclick = function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); };
  
  // ---------- tabs ----------
  function switchTab(t) {
    document.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === t); });
    if ($('pageHome')) $('pageHome').classList.toggle('hidden', t !== 'home');
    if ($('pageFriends')) $('pageFriends').classList.toggle('hidden', t !== 'friends');
    if ($('pageAccount')) $('pageAccount').classList.toggle('hidden', t !== 'account');
    if (t === 'friends') loadFriends();
    if (t === 'account') renderAccount();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.onclick = function () { switchTab(b.dataset.tab); };
  });
  if ($('headerAccountBtn')) $('headerAccountBtn').onclick = function () { switchTab('account'); };

  // ---------- account center ----------
  function renderAccount() {
    if (!me) return;
    if ($('accEmail')) $('accEmail').value = me.email || '';
    if ($('accUsername')) $('accUsername').value = profile ? profile.username : '';
    if ($('accErr')) $('accErr').textContent = '';
  }

  if ($('accForm')) {
    $('accForm').onsubmit = async function (e) {
      e.preventDefault();
      var u = $('accUsername').value.trim().toLowerCase();
      var errEl = $('accErr'); if (errEl) errEl.textContent = '';
      if (!/^[a-z0-9_]{3,20}$/.test(u)) {
        if (errEl) errEl.textContent = 'Username: 3 to 20 letters, numbers or underscores.';
        return;
      }
      if (profile && profile.username === u) {
        toast('No changes made.');
        return;
      }
      var btn = $('accSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
      var r = await db.from('profiles').update({ username: u }).eq('id', me.id);
      btn.disabled = false; btn.textContent = 'Save Username';
      if (r.error) {
        if (errEl) errEl.textContent = /unique/i.test(r.error.message) ? 'That username is taken.' : 'Failed to update username.';
        return;
      }
      if (!profile) profile = {};
      profile.username = u;
      toast('Username updated!');
    };
  }

  // ---------- friends ----------
  var friends = [];
  async function loadFriends() {
    if (!me) return;
    var r = await db.from('friendships').select('id,requester,addressee,status')
      .or('requester.eq.' + me.id + ',addressee.eq.' + me.id);
    if (r.error) return toast('Could not load friends.');
    var ids = r.data.map(function (f) { return f.requester === me.id ? f.addressee : f.requester; });
    var names = {};
    if (ids.length) {
      var p = await db.from('profiles').select('id,username').in('id', ids);
      (p.data || []).forEach(function (x) { names[x.id] = x.username; });
    }
    friends = r.data.map(function (f) {
      var other = f.requester === me.id ? f.addressee : f.requester;
      return { id: f.id, otherId: other, username: names[other] || 'unknown', status: f.status, incoming: f.addressee === me.id };
    });
    renderFriends();
  }
  function personRow(name, actions) {
    var row = el('div', 'row');
    row.appendChild(el('div', 'avatar', name.charAt(0)));
    row.appendChild(el('div', 'name', name));
    var a = el('div', 'actions'); actions.forEach(function (x) { a.appendChild(x); });
    row.appendChild(a); return row;
  }
  function btn(label, cls, fn) {
    var b = el('button', 'btn small ' + (cls || ''), label); b.type = 'button'; b.onclick = fn; return b;
  }
  function fill(box, rows, emptyText) {
    box.innerHTML = '';
    if (!rows.length && emptyText) box.appendChild(el('p', 'note', emptyText));
    rows.forEach(function (r) { box.appendChild(r); });
  }
  function renderFriends() {
    var req = friends.filter(function (f) { return f.status === 'pending' && f.incoming; });
    var sent = friends.filter(function (f) { return f.status === 'pending' && !f.incoming; });
    var acc = friends.filter(function (f) { return f.status === 'accepted'; });
    if ($('reqCard')) $('reqCard').classList.toggle('hidden', !req.length);
    if ($('sentCard')) $('sentCard').classList.toggle('hidden', !sent.length);
    if ($('badge')) {
      $('badge').textContent = req.length;
      $('badge').classList.toggle('hidden', !req.length);
    }
    if ($('reqList')) {
      fill($('reqList'), req.map(function (f) {
        return personRow(f.username, [btn('Accept', 'good', function () { answer(f, true); }), btn('Decline', 'ghost', function () { answer(f, false); })]);
      }));
    }
    if ($('friendList')) {
      fill($('friendList'), acc.map(function (f) {
        return personRow(f.username, [btn('Remove', 'ghost', function () { removeFriend(f); })]);
      }), 'No friends yet. Search for a username above to send a request.');
    }
    if ($('sentList')) {
      fill($('sentList'), sent.map(function (f) {
        return personRow(f.username, [btn('Cancel', 'ghost', function () { removeFriend(f, true); })]);
      }));
    }
  }
  async function answer(f, yes) {
    var r = yes ? await db.from('friendships').update({ status: 'accepted' }).eq('id', f.id)
                : await db.from('friendships').delete().eq('id', f.id);
    if (r.error) return toast('Something went wrong. Try again.');
    toast(yes ? 'You are now friends with ' + f.username + '.' : 'Request declined.');
    loadFriends();
  }
  async function removeFriend(f, cancel) {
    if (!cancel && !confirm('Remove ' + f.username + ' from your friends?')) return;
    var r = await db.from('friendships').delete().eq('id', f.id);
    if (r.error) return toast('Something went wrong. Try again.');
    toast(cancel ? 'Request cancelled.' : 'Friend removed.'); loadFriends();
  }
  if ($('searchForm')) {
    $('searchForm').onsubmit = async function (e) {
      e.preventDefault();
      var q = $('searchInput').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      var box = $('searchResults'); box.innerHTML = '';
      if (q.length < 2) return box.appendChild(el('p', 'note', 'Type at least 2 characters.'));
      var r = await db.from('profiles').select('id,username').ilike('username', q + '%').neq('id', me.id).limit(8);
      if (r.error) return box.appendChild(el('p', 'note', 'Search failed. Try again.'));
      if (!r.data.length) return box.appendChild(el('p', 'note', 'No users found for "' + q + '".'));
      r.data.forEach(function (u) {
        var rel = friends.find(function (f) { return f.otherId === u.id; });
        var action = rel
          ? el('span', 'note', rel.status === 'accepted' ? 'Friends' : rel.incoming ? 'Sent you a request' : 'Requested')
          : btn('Add', '', async function () {
              var ins = await db.from('friendships').insert({ requester: me.id, addressee: u.id });
              if (ins.error) return toast('Could not send request.');
              toast('Request sent to ' + u.username + '.'); await loadFriends(); $('searchForm').onsubmit(new Event('submit'));
            });
        box.appendChild(personRow(u.username, [action]));
      });
    };
  }

  // ---------- theme + init ----------
  if ($('theme')) {
    $('theme').onclick = function () {
      var r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
      r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('streak-theme', r.dataset.theme); } catch (e) {}
    };
  }
  try { var t = localStorage.getItem('streak-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  if ($('date')) $('date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if ($('dows')) $('dows').innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (x) { return '<div class="dow">' + x + '</div>'; }).join('');
})();