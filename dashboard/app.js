// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view
// with the model's own inputs and the protocol's farm plan, and a separate
// live-token view. No network: every byte it shows is in data.js.
//
// The page recomputes a row's implied value from the snapshot figures and
// checks the number board.json carries, and it derives the farm plan from the
// same category, chain, TVL and age the program used, so the page, the board
// and the code are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', preOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: TVL x the snapshot's own median multiple x the
  // category factor x the growth multiplier x the maturity multiplier. Below
  // the kink the fall is charged at full weight, not half — the same
  // piecewise formula lib/model.ts uses, so the page and the board agree.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult;
    if (growth >= model.growth_kink) {
      growthMult = 1 + (growth / 100) * model.growth_weight;
    } else {
      growthMult = 1 + (model.growth_kink / 100) * model.growth_weight + ((growth - model.growth_kink) / 100) * model.growth_below_weight;
    }
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var factor = (model.category_factors && model.category_factors[row.category || 'Other']) || 1;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * factor * growthMult * maturity));
  }

  // The farm plan is the same derivation main.ts writes to board.json: the
  // category, the chain, the TVL and the age decide the action, the capital,
  // the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 250e6) return 120;
    if (p.tvl_usd >= 50e6) return 75;
    return 40;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 90) return 90;
    if (age < 365) return 60;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open; the deposit is the position.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Add $" + capital + " of liquidity to " + name + "'s busiest pool on " + chain + ' and leave the position in place.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and put the bridged funds to work in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' through ' + name + ' on ' + chain + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open a single small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Back one market on ' + name + ' with $' + capital + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Place $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + " of the yield-bearing asset " + name + ' issues on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 120 ? 6 : 3;
    return [
      { text: 'Set up a fresh wallet for this farm and move in only the capital you plan to use; write the seed phrase on paper and keep it offline, never in a screenshot or chat.', cost: 'under $3 of gas for the first transfer', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Use one more feature of ' + p.name + ' — a swap, a borrow, a vote, a referral or a second pool — so the wallet shows more than a single deposit.', cost: 'about $2 of gas', time: '10 minutes' },
      { text: 'Repeat one on-chain action every week: a deposit, a swap, a borrow or a vote. One deposit alone rarely counts for a snapshot.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days so the activity spans more than one snapshot window.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check " + p.name + "'s own points or rewards page each week and claim only through the link that page publishes; never pay a fee to claim and never follow a link from a DM.", cost: 'no fee to check', time: '10 minutes a week' },
      { text: 'Keep a farm log — wallet, dates, amounts and transaction hashes — and plan the exit in advance: unwind in small steps and keep the log for taxes.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function readShot() {
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    if (!shot) return;
    if (shot === 'detail' && params.get('p')) state.selected = params.get('p');
    if (shot === 'filtered') {
      if (params.get('category')) state.category = params.get('category');
      if (params.get('q')) state.q = params.get('q');
      if (params.get('chain')) state.chain = params.get('chain');
    }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function headerHtml() {
    return '<header class="top"><div class="brand"><span class="mark"></span><span class="brand-name">Token Radar</span></div>' +
      '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocol index</span><span>' + esc(DATA.model_version) + ' model</span></div></header>';
  }
  function heroHtml() {
    return '<section class="hero"><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by the same model. Implied value is a model, not a promise.</p>' +
      '<div class="stats">' +
      '<div class="stat"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="stat"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="stat"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="stat"><span>Live-token protocols set aside</span><b>' + DATA.live_size + '</b></div>' +
      '</div></section>';
  }
  function modelHtml() {
    var m = DATA.model;
    var factors = Object.keys(m.category_factors || {}).sort().map(function (c) {
      return c + ' ' + m.category_factors[c];
    }).join(', ');
    return '<section class="model-card"><h2>How implied value is computed</h2>' +
      '<p>One function scores every protocol, from the snapshot\u2019s own figures. The base multiple is the median market-cap-to-TVL ratio of the protocols in this snapshot that already trade (' + m.base_multiple + '); each category\u2019s factor is that category\u2019s own median ratio against it. No protocol name is special-cased.</p>' +
      '<div class="formula">implied = round( tvl_usd x ' + m.base_multiple + ' x category_factor x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )</div>' +
      '<p>Age is the time since the protocol was first listed, the record of how long it has run with no token; an unlisted age counts as ' + m.unknown_age_days + ' days. Category factors: ' + esc(factors) + '. Bridges and canonical bridges are left out because each is a wrapped form of a token that already trades.</p></section>';
  }
  function controlsHtml() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var tabs = '';
    if (!state.preOnly) {
      tabs = '<button type="button" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
        '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>';
    }
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + option('all', 'All categories', state.category === 'all') + categories.map(function (c) { return option(c, c, state.category === c); }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + option('all', 'All chains', state.chain === 'all') + chains.map(function (c) { return option(c, c, state.chain === c); }).join('') + '</select></div>' +
      '<label class="check"><input type="checkbox" id="preOnly"' + (state.preOnly ? ' checked' : '') + '> Pre-token only</label>' +
      '<div class="tabs" role="group" aria-label="Token status">' + tabs + '</div>' +
      '<span class="count">' + (state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols') + '</span>' +
      '</div>';
  }
  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' v' : ' ^') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + esc(label) + esc(arrow) + '</button></th>';
  }
  function boardHtml() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button class="button primary" type="button" data-clear="1">Clear filters</button></div></div>';
    }
    var max = list[0].implied_value_usd || 1;
    var rowsHtml = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      return '<tr data-row="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chains) + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + growthClass + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
        '<td><span class="pill">no token</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption class="sub">Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortHeader('implied', 'Rank') + sortHeader('name', 'Protocol') + sortHeader('tvl', 'TVL') + sortHeader('growth', '7d') + sortHeader('age', 'Age') + sortHeader('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }
  function liveHtml() {
    var rowsHtml = DATA.live.map(function (r) {
      var chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      return '<tr><td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chains) + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="pill live">already trades</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption class="sub">Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  var dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.setAttribute('aria-labelledby', 'detail-title');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var match = recomputed === row.implied_value_usd;
    var chains = row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain';
    dialog.innerHTML =
      '<div class="detail-head"><div><span class="brand-name">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc(chains) + '</p></div>' +
      '<button class="close" type="button" data-close="1" aria-label="Close details">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3><div class="kv">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Category factor</span><b>' + row.category_factor + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + row.growth_multiplier + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + row.maturity_multiplier + '</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div><p class="note">Model ' + esc(DATA.model_version) + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p></section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' +
      steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
      }).join('') + '</ol></section>';
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.innerHTML = '<div class="shell">' + headerHtml() + heroHtml() +
      (state.tab === 'pre-token' ? modelHtml() : '') + controlsHtml() +
      (state.tab === 'pre-token' ? boardHtml() : liveHtml()) + '</div>';
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var pre = document.getElementById('preOnly');
    if (pre) pre.addEventListener('change', function () {
      state.preOnly = pre.checked;
      if (state.preOnly) state.tab = 'pre-token';
      render();
    });
    if (state.selected) openDetail(state.selected);
  }

  app.addEventListener('click', function (e) {
    var sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      var key = sortBtn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      render();
      return;
    }
    var tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { state.tab = tabBtn.getAttribute('data-tab'); writeHash(); render(); return; }
    var clearBtn = e.target.closest('[data-clear]');
    if (clearBtn) { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); return; }
    var closeBtn = e.target.closest('[data-close]');
    if (closeBtn) { dialog.close(); return; }
    var row = e.target.closest('[data-row]');
    if (row) openDetail(row.getAttribute('data-row'));
  });
  app.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('data-row')) {
      e.preventDefault();
      openDetail(e.target.getAttribute('data-row'));
    }
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });

  readHash();
  readShot();
  render();
})();
