(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.APP_CONFIG || {};
  var VIEWS = ['setup', 'auth', 'main'];
  function show(v) { VIEWS.forEach(function (x) { $(x).classList.toggle('hidden', x !== v); }); }

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_URL.indexOf('YOUR_') < 0;
  if (!configured || !window.supabase) { show('setup'); return; }
  var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- helpers ----------
  var toastT;
  function toast(t) {
    var e = $('toast'); e.textContent = t; e.classList.add('show');
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
    $('userField').classList.toggle('hidden', !signup);
    $('authBtn').textContent = signup ? 'Create account' : 'Log in';
    $('authSub').textContent = signup ? 'Create an account to track your streak.' : 'Welcome back. Log in to continue.';
    $('authSwitch').textContent = signup ? 'Already have an account? Log in' : 'New here? Create an account';
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    authMsg('');
  }
  function authMsg(t, ok) { var e = $('authErr'); e.textContent = t; e.classList.toggle('okc', !!ok); }
  $('authSwitch').onclick = function () { setMode(mode === 'login' ? 'signup' : 'login'); };

  $('authForm').onsubmit = async function (e) {
    e.preventDefault();
    var email = $('email').value.trim(), pw = $('password').value, btn = $('authBtn');
    if (!email || !pw) return authMsg('Enter your email and password.');
    if (pw.length < 6) return authMsg('Password must be at least 6 characters.');
    btn.disabled = true; authMsg('');
    try {
      if (mode === 'signup') {
        var u = $('username').value.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new Error('Username: 3 to 20 letters, numbers or underscores.');
        var r = await db.auth.signUp({ email: email, password: pw, options: { data: { username: u } } });
        if (r.error) throw new Error(/database error/i.test(r.error.message) ? 'That username is taken. Try another.' : r.error.message);
        if (!r.data.session) { authMsg('Account created. Check your email to confirm, then log in.', true); setMode('login'); authMsg('Account created. Check your email to confirm, then log in.', true); }
      } else {
        var l = await db.auth.signInWithPassword({ email: email, password: pw });
        if (l.error) throw new Error(l.error.message);
      }
    } catch (err) { authMsg(err.message); }
    btn.disabled = false;
  };

  $('logout').onclick = function () { db.auth.signOut(); };

  var startedFor = null;
  db.auth.onAuthStateChange(function (event, session) {
    if (session && session.user) {
      if (startedFor === session.user.id) return;
      startedFor = session.user.id;
      setTimeout(function () { start(session.user); }, 0); // avoid calling supabase inside the callback
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
      show('main'); render(); loadFriends();
    } catch (err) { toast('Could not load your data. Check your connection.'); show('main'); }
  }

  // ---------- streak logic ----------
  var now = new Date(), todayK = k(now), view = new Date(now.getFullYear(), now.getMonth(), 1), sel = null;

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
    if (data[todayK] === 'f') return 'It happens. Today is logged, and tomorrow is a fresh start.';
    if (s === 0) return 'Log today to start your streak.';
    if (s < 3) return 'Good start. Keep stacking days.';
    if (s < 7) return 'Momentum is building. Stay with it.';
    if (s < 30) return 'Strong run. Every day makes the next one easier.';
    return 'Serious discipline. Keep going.';
  }
  function render() {
    var s = streak(), g = goals.find(function (x) { return x > s; }) || s + 1, c = 0, f = 0;
    Object.keys(data).forEach(function (x) { data[x] === 'c' ? c++ : f++; });
    $('streak').textContent = s; $('best').textContent = best(); $('clean').textContent = c; $('fails').textContent = f;
    var circ = 2 * Math.PI * 52;
    $('bar').setAttribute('stroke-dasharray', (Math.min(s / g, 1) * circ) + ' ' + circ);
    $('msg').textContent = msgFor(s) + (s > 0 && data[todayK] !== 'f' ? ' Next goal: ' + g + ' days.' : '');
    document.querySelectorAll('[data-set]').forEach(function (b) { b.classList.toggle('on', data[todayK] === b.dataset.set); });
    $('todaySub').textContent = data[todayK] === 'c' ? 'Logged as clean. Tap "I failed" to change it.'
      : data[todayK] === 'f' ? 'Logged as failed. Tap "I stayed clean" to change it.'
      : 'Log it once. You can change it any time today.';
    renderCal();
  }
  function renderCal() {
    var y = view.getFullYear(), m = view.getMonth();
    $('month').textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), h = '';
    for (var i = 0; i < first; i++) h += '<div class="day empty"></div>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m, d), key = k(dt), st = data[key] || '';
      var cls = 'day' + (st ? ' ' + st : '') + (dt > now && key !== todayK ? ' fut' : '') + (key === todayK ? ' today-d' : '');
      var label = dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (st === 'c' ? ', clean' : st === 'f' ? ', failed' : ', not logged');
      h += '<button class="' + cls + '" data-day="' + key + '" aria-label="' + label + '">' + d + '</button>';
    }
    $('cal').innerHTML = h;
    $('next').disabled = (y === now.getFullYear() && m === now.getMonth());
  }
  async function setDay(key, st) {
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

  document.querySelectorAll('[data-set]').forEach(function (b) { b.onclick = function () { setDay(todayK, b.dataset.set); }; });
  $('cal').onclick = function (e) {
    var b = e.target.closest('[data-day]'); if (!b) return;
    sel = b.dataset.day;
    $('sheetTitle').textContent = fromK(sel).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.querySelectorAll('[data-sheet]').forEach(function (x) { x.classList.toggle('on', !!x.dataset.sheet && data[sel] === x.dataset.sheet); });
    $('scrim').classList.add('open');
  };
  function closeSheet() { $('scrim').classList.remove('open'); }
  $('scrim').onclick = function (e) { if (e.target === $('scrim')) closeSheet(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-sheet]').forEach(function (b) { b.onclick = function () { setDay(sel, b.dataset.sheet); closeSheet(); }; });
  $('prev').onclick = function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); };
  $('next').onclick = function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); };
  $('reset').onclick = async function () {
    if (!confirm('Erase all your logged days? This cannot be undone.')) return;
    var r = await db.from('logs').delete().eq('user_id', me.id);
    if (r.error) return toast('Could not erase. Try again.');
    data = {}; render(); toast('All logged days erased.');
  };

  // ---------- tabs ----------
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.onclick = function () {
      var t = b.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('pageHome').classList.toggle('hidden', t !== 'home');
      $('pageFriends').classList.toggle('hidden', t !== 'friends');
      if (t === 'friends') loadFriends();
      window.scrollTo(0, 0);
    };
  });

  // ---------- friends ----------
  var friends = []; // {id, otherId, username, status, incoming}
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
    $('reqCard').classList.toggle('hidden', !req.length);
    $('sentCard').classList.toggle('hidden', !sent.length);
    $('badge').textContent = req.length; $('badge').classList.toggle('hidden', !req.length);
    fill($('reqList'), req.map(function (f) {
      return personRow(f.username, [btn('Accept', 'good', function () { answer(f, true); }), btn('Decline', 'ghost', function () { answer(f, false); })]);
    }));
    fill($('friendList'), acc.map(function (f) {
      return personRow(f.username, [btn('Remove', 'ghost', function () { removeFriend(f); })]);
    }), 'No friends yet. Search for a username above to send a request.');
    fill($('sentList'), sent.map(function (f) {
      return personRow(f.username, [btn('Cancel', 'ghost', function () { removeFriend(f, true); })]);
    }));
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

  // ---------- theme + init ----------
  $('theme').onclick = function () {
    var r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('streak-theme', r.dataset.theme); } catch (e) {}
  };
  try { var t = localStorage.getItem('streak-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  $('date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('dows').innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (x) { return '<div class="dow">' + x + '</div>'; }).join('');
})();
