'use strict';

const positions = {
  schumer: 'Supports Schumer',
  'van-hollen': 'Supports Van Hollen',
  'oppose-schumer': 'Wants change / no pick',
  unclear: 'Unclear',
  'no-public-position': 'No public position',
};
const candidates = { schumer: 'Chuck Schumer', 'van-hollen': 'Chris Van Hollen' };
const shortNames = { schumer: 'Schumer', 'van-hollen': 'Van Hollen' };
const seatOrder = ['schumer', 'unclear', 'no-public-position', 'oppose-schumer', 'van-hollen'];
const stateNames = {
  AK: 'Alaska', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', IL: 'Illinois', KS: 'Kansas', MA: 'Massachusetts',
  MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', NC: 'North Carolina',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York',
  OH: 'Ohio', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  TX: 'Texas', VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin',
};
const storageKey = 'election-night-26:senate-leadership-scenario';
const elements = {
  tracker: document.querySelector('#tracker'),
  map: document.querySelector('#seats'),
  candidates: document.querySelector('#candidates'),
  legend: document.querySelector('#legend'),
  profile: document.querySelector('#senator-detail'),
  senatorPanel: document.querySelector('#senator-panel'),
  roster: document.querySelector('#roster'),
  search: document.querySelector('#search'),
  positionFilter: document.querySelector('#position-filter'),
  leanFilter: document.querySelector('#lean-filter'),
  scenario: document.querySelector('#scenario-summary'),
  reset: document.querySelector('#reset-scenario'),
};
const viewButtons = [...document.querySelectorAll('[data-view]')];
const seatsByName = new Map();
const rowsByName = new Map();
let data;
let roster;
let publicCounts;
let activeCount;
let selected;
let view = 'public';
let picks = {};

function node(tag, className, value) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (value !== undefined) result.textContent = value;
  return result;
}

function option(value, label) {
  const result = node('option', '', label);
  result.value = value;
  return result;
}

function formatDate(value) {
  if (!value) return '';
  const simpleDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(simpleDate ? value + 'T00:00:00Z' : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: simpleDate ? 'UTC' : 'America/New_York',
  }).format(date);
}

function labelFor(senator) {
  return positions[senator.position];
}

function countVotes(senators, choice) {
  const counts = Object.fromEntries(Object.keys(positions).map(position => [position, 0]));
  for (const senator of senators) {
    const position = choice(senator);
    counts[Object.hasOwn(positions, position) ? position : 'no-public-position']++;
  }
  return counts;
}

function majority(size) {
  return Math.floor(size / 2) + 1;
}

function readPicks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return Object.fromEntries(roster.flatMap(senator => {
      const pick = saved?.[senator.name];
      return Object.hasOwn(candidates, pick) ? [[senator.name, pick]] : [];
    }));
  } catch {
    return {};
  }
}

function savePicks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(picks));
  } catch {
    // The scenario remains usable in memory when storage is unavailable.
  }
}

function choosePositionFilter(position) {
  elements.positionFilter.value = elements.positionFilter.value === position ? 'all' : position;
  renderFilters();
}

function makeCandidate(position) {
  const total = publicCounts[position];
  const button = node('button', 'candidate');
  button.type = 'button';
  button.dataset.position = position;
  button.dataset.filterPosition = position;
  button.setAttribute('aria-pressed', 'false');
  button.append(
    node('span', 'candidate-name', candidates[position]),
    node('strong', 'candidate-number', total),
    node('span', 'candidate-caption', 'Public support'),
  );
  button.addEventListener('click', () => choosePositionFilter(position));
  return button;
}

function buildCounts() {
  const threshold = node('div', 'threshold');
  threshold.append(
    node('strong', 'threshold-number', majority(activeCount)),
    node('span', 'threshold-caption', 'Full turnout target'),
  );
  elements.candidates.append(makeCandidate('schumer'), threshold, makeCandidate('van-hollen'));
  elements.positionFilter.append(option('all', 'Any public position'));
  for (const [position, label] of Object.entries(positions)) {
    elements.positionFilter.append(option(position, label));
    const button = node('button', 'legend-button');
    button.type = 'button';
    button.dataset.position = position;
    button.dataset.filterPosition = position;
    button.setAttribute('aria-pressed', 'false');
    button.append(node('span', 'dot'), node('span', '', label), node('strong', '', publicCounts[position]));
    button.addEventListener('click', () => choosePositionFilter(position));
    elements.legend.append(button);
  }
}

function seatCoordinates(total) {
  const radii = [145, 186, 227, 269, 311];
  const sum = radii.reduce((a, b) => a + b, 0);
  let placed = 0;
  return radii.flatMap((radius, ring) => {
    const count = ring === radii.length - 1 ? total - placed : Math.round(total * radius / sum);
    placed += count;
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * (.035 + .93 * (index + .5) / count);
      return {
        angle, radius,
        x: (350 - Math.cos(angle) * radius) / 700 * 100,
        y: (347 - Math.sin(angle) * radius) / 374 * 100,
      };
    });
  }).sort((a, b) => a.angle - b.angle || b.radius - a.radius);
}

function buildSeats() {
  const senators = [...roster].sort((a, b) => {
    return seatOrder.indexOf(a.position) - seatOrder.indexOf(b.position) || a.name.localeCompare(b.name);
  });
  const coordinates = seatCoordinates(senators.length);
  for (let index = 0; index < senators.length; index++) {
    const senator = senators[index];
    const coords = coordinates[index];
    const button = node('button', 'seat');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('aria-pressed', 'false');
    button.dataset.position = senator.position;
    button.toggleAttribute('data-conditional', !!senator.conditional);
    button.style.setProperty('--x', coords.x + '%');
    button.style.setProperty('--y', coords.y + '%');
    button.addEventListener('click', event => {
      selectSenator(senator);
      if (event.detail > 0 && matchMedia('(max-width: 700px)').matches) {
        elements.senatorPanel.scrollIntoView({ block: 'start' });
      }
    });
    button.addEventListener('keydown', event => {
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      const next = senators[(index + delta + senators.length) % senators.length];
      seatsByName.get(next.name).focus();
      selectSenator(next);
    });
    seatsByName.set(senator.name, button);
    elements.map.append(button);
  }
}

function buildRoster() {
  for (const senator of roster) {
    const row = node('tr');
    const nameCell = node('td');
    const button = node('button', 'roster-name', senator.name);
    button.type = 'button';
    button.setAttribute('aria-controls', 'senator-panel');
    button.addEventListener('click', () => {
      selectSenator(senator);
      document.querySelector('.profile-name').focus({ preventScroll: true });
      elements.senatorPanel.scrollIntoView({ block: 'nearest' });
    });
    nameCell.append(button);
    if (senator.role) nameCell.append(node('span', 'roster-role', senator.role));

    const status = node('span', 'roster-status');
    status.dataset.position = senator.position;
    status.append(node('span', 'dot'), node('span', '', labelFor(senator)));
    const publicCell = node('td');
    publicCell.append(status);
    const leanCell = node('td');
    if (senator.lean) {
      const lean = node('span', 'roster-status', shortNames[senator.lean]);
      lean.dataset.position = senator.lean;
      leanCell.append(lean);
      if (senator.leanConfidence) leanCell.append(node('span', 'roster-role', senator.leanConfidence + ' confidence'));
    } else {
      leanCell.textContent = '—';
      leanCell.setAttribute('aria-label', 'No lean assigned');
    }
    row.append(nameCell, node('td', '', senator.state), publicCell, leanCell);
    elements.roster.append(row);
    rowsByName.set(senator.name, row);
  }
}

function matching(senator) {
  const query = elements.search.value.trim().toLocaleLowerCase('en-US');
  const searchText = [senator.name, senator.state, stateNames[senator.state]].join(' ').toLocaleLowerCase('en-US');
  const position = elements.positionFilter.value;
  const lean = elements.leanFilter.value;
  return searchText.includes(query) &&
    (position === 'all' || senator.position === position) &&
    (lean === 'all' || (senator.lean || 'none') === lean);
}

function renderFilters() {
  let count = 0;
  for (const senator of roster) {
    const visible = matching(senator);
    rowsByName.get(senator.name).hidden = !visible;
    seatsByName.get(senator.name).toggleAttribute('data-dim', !visible);
    if (visible) count++;
  }
  document.querySelector('#result-count').textContent = count + ' of ' + roster.length + ' profiles';
  document.querySelector('#no-results').hidden = count !== 0;
  for (const button of document.querySelectorAll('[data-filter-position]')) {
    button.setAttribute('aria-pressed', String(button.dataset.filterPosition === elements.positionFilter.value));
  }
}

function renderView() {
  const researchCounts = countVotes(roster, senator => senator.lean);
  const included = view === 'scenario'
    ? roster.filter(senator => !senator.conditional || picks[senator.name]).length
    : activeCount;
  for (const senator of roster) {
    const button = seatsByName.get(senator.name);
    const lean = view === 'research' && senator.lean;
    const pick = view === 'scenario' && picks[senator.name];
    button.dataset.position = pick || senator.position;
    button.toggleAttribute('data-scenario-pick', Boolean(pick));
    if (lean) button.dataset.lean = lean;
    else delete button.dataset.lean;
    const status = senator.name + ', ' + senator.state + '. ' + labelFor(senator) +
      (lean ? '. Research lean: ' + shortNames[lean] : '') +
      (pick ? '. My scenario pick: ' + shortNames[pick] : '') +
      (senator.conditional ? '. Conditional seat' : '');
    button.title = status;
    button.setAttribute('aria-label', status);
  }
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  const conditional = roster.some(senator => senator.conditional);
  const conditionalNote = conditional ? 'Dashed seats are conditional.' : '';
  const notes = {
    public: 'Select a seat to see the senator’s sources.',
    research: 'Outlined seats show inferred leans · Schumer ' + researchCounts.schumer +
      ' · Van Hollen ' + researchCounts['van-hollen'] + '.',
    scenario: 'A center dot marks your picks. Other seats retain their public positions.',
  };
  document.querySelector('#map-key').textContent = [notes[view], conditionalNote].filter(Boolean).join(' ');
  document.querySelector('#seat-total').textContent = included;
  document.querySelector('#seat-caption').textContent = view === 'scenario' ? 'Seats in your scenario' : 'Caucus seats counted';
}

function profileField(label, value, position, confidence) {
  const field = node('div', 'profile-field');
  const description = node('strong', 'profile-field-value', value);
  if (position) description.dataset.position = position;
  field.append(node('span', 'profile-field-label', label), description);
  if (confidence) field.append(node('span', 'confidence', confidence + ' confidence'));
  return field;
}

function sourceLink(key) {
  const source = data.sources?.[key];
  if (!source || !/^https?:\/\//i.test(source.url)) return null;
  const link = node('a', '', source.label || source.url);
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function buildPickSelect(senator) {
  const label = node('label', '', 'My scenario pick');
  const select = node('select');
  select.append(option('', 'Use public position'), option('schumer', 'Schumer'), option('van-hollen', 'Van Hollen'));
  select.value = picks[senator.name] || '';
  select.addEventListener('change', () => {
    if (select.value) picks[senator.name] = select.value;
    else delete picks[senator.name];
    savePicks();
    renderScenario();
    if (view === 'scenario') renderView();
  });
  label.append(select);
  const container = node('div', 'profile-scenario');
  container.append(label);
  return container;
}

function renderProfile() {
  const senator = selected;
  document.querySelector('#profile-state').textContent = senator.state;
  const heading = node('h3', 'profile-name', senator.name);
  heading.tabIndex = -1;
  const affiliation = senator.party === 'I' ? 'Independent · Democratic caucus' : 'Democrat';
  const role = node('p', 'profile-role', [stateNames[senator.state] || senator.state, affiliation, senator.role].filter(Boolean).join(' · '));
  const fields = node('div', 'profile-fields');
  fields.append(
    profileField('Public position', labelFor(senator), senator.position),
    profileField('Research lean', shortNames[senator.lean] || 'None assigned', senator.lean, senator.leanConfidence),
  );
  elements.profile.replaceChildren(heading, role, fields);
  if (senator.analysis) elements.profile.append(node('p', 'profile-text', senator.analysis));
  if (senator.conditional) {
    elements.profile.append(node('p', 'profile-conditional', 'This seat is conditional. A scenario pick includes it in your count.'));
  }
  elements.profile.append(node('h4', 'evidence-heading', 'Evidence'));
  if (senator.evidence?.length) {
    const evidence = node('ul', 'evidence-list');
    for (const item of senator.evidence) {
      const line = node('li', '', item.text);
      const link = sourceLink(item.source);
      if (link) line.append(' ', link);
      evidence.append(line);
    }
    elements.profile.append(evidence);
  } else {
    elements.profile.append(node('p', 'no-evidence', 'No individual source is listed for this position.'));
  }
  elements.profile.append(buildPickSelect(senator));
}

function selectSenator(senator) {
  if (selected) {
    const oldSeat = seatsByName.get(selected.name);
    oldSeat.removeAttribute('data-selected');
    oldSeat.setAttribute('aria-pressed', 'false');
    oldSeat.tabIndex = -1;
    rowsByName.get(selected.name).removeAttribute('data-selected');
  }
  selected = senator;
  const seat = seatsByName.get(senator.name);
  seat.setAttribute('data-selected', '');
  seat.setAttribute('aria-pressed', 'true');
  seat.tabIndex = 0;
  rowsByName.get(senator.name).setAttribute('data-selected', '');
  renderProfile();
}

function renderScenario() {
  const totalPicks = Object.keys(picks).length;
  const included = roster.filter(senator => !senator.conditional || picks[senator.name]);
  const scenarioVotes = countVotes(included, senator => picks[senator.name] || senator.position);
  elements.scenario.replaceChildren();
  for (const position of Object.keys(candidates)) {
    const score = node('span', 'scenario-score');
    score.dataset.position = position;
    score.append(shortNames[position] + ' ', node('strong', '', scenarioVotes[position]));
    elements.scenario.append(score);
  }
  const unassigned = included.length - scenarioVotes.schumer - scenarioVotes['van-hollen'];
  elements.scenario.append(
    node('span', 'scenario-score', unassigned + ' unassigned'),
    node('span', 'scenario-score', majority(included.length) + ' full turnout target'),
  );
  elements.reset.hidden = totalPicks === 0;
}

function renderMethodology() {
  const section = document.querySelector('.methodology-content');
  if (data.methodology) section.append(node('p', '', data.methodology));
  const sources = (data.methodologySources || []).map(sourceLink).filter(Boolean);
  if (sources.length) {
    const line = node('p');
    for (let index = 0; index < sources.length; index++) {
      if (index) line.append(' · ');
      line.append(sources[index]);
    }
    section.append(line);
  }
}

function initialize() {
  if (!Array.isArray(data.senators) || !data.senators.length) throw new Error('No senators found.');
  roster = [...data.senators].sort((a, b) => a.name.localeCompare(b.name));
  if (roster.some(senator => !Object.hasOwn(positions, senator.position))) throw new Error('Invalid public position.');
  const active = roster.filter(senator => !senator.conditional);
  activeCount = active.length;
  publicCounts = countVotes(active, senator => senator.position);
  picks = readPicks();
  document.querySelector('#as-of').textContent = data.asOf ? 'Updated ' + formatDate(data.asOf) : '';
  document.querySelector('#election-date').textContent = data.electionDate ? 'Leadership vote · ' + formatDate(data.electionDate) : '';
  document.querySelector('#date-block').hidden = !(data.asOf || data.electionDate);
  document.querySelector('#caucus-note').textContent = data.caucusNote || '';
  document.querySelector('.topbar-directory').hidden = false;
  buildCounts();
  buildSeats();
  buildRoster();
  renderFilters();
  renderView();
  selectSenator(roster.find(senator => senator.name === 'Chris Van Hollen') || roster[0]);
  renderScenario();
  renderMethodology();
  elements.tracker.hidden = false;
}

for (const button of viewButtons) {
  button.addEventListener('click', () => {
    view = button.dataset.view;
    renderView();
  });
}
elements.search.addEventListener('input', renderFilters);
elements.positionFilter.addEventListener('change', renderFilters);
elements.leanFilter.addEventListener('change', renderFilters);
document.querySelector('#clear-filters').addEventListener('click', () => {
  elements.search.value = '';
  elements.positionFilter.value = 'all';
  elements.leanFilter.value = 'all';
  renderFilters();
  elements.search.focus();
});
elements.reset.addEventListener('click', () => {
  picks = {};
  savePicks();
  renderScenario();
  if (view === 'scenario') renderView();
  renderProfile();
});
document.querySelector('#retry').addEventListener('click', () => location.reload());

(async () => {
  try {
    const response = await fetch('./leadership-data.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Tracker data returned HTTP ' + response.status);
    data = await response.json();
    initialize();
  } catch (error) {
    console.error('Unable to load leadership tracker', error);
    document.querySelector('#load-error').hidden = false;
  } finally {
    document.querySelector('#loading').hidden = true;
  }
})();
