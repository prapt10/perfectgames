'use strict';
/* ============================================================
 * Perfect Games — Dumb Charades engine (pure logic, no I/O)
 *
 * Rules (classic dumb charades):
 *  - Two teams (A/B) take turns; solo practice mode = 1 team.
 *  - Each turn: one member of the acting team is the ACTOR and
 *    silently acts out a Hindi movie or Hindi song title.
 *  - Teammates guess (typed online / shouted + tap in party mode).
 *    First correct guess = 1 point for the team.
 *  - Actors rotate within each team; teams alternate turns.
 *  - 20s to pick a title, 60s to act, 6s reveal pause.
 *  - Highest score after N rounds wins (ties possible).
 *  - No bots: charades needs real humans to act & guess.
 * ============================================================ */

const CAT_MOVIE = 'movie';
const CAT_SONG = 'song';
const CHOOSE_SECS = 20;
const ACT_SECS = 60;
const REVEAL_SECS = 6;

const CAT_LABEL = { movie: 'Hindi Movie', song: 'Hindi Song' };

/* [title, category, ...aliases] — romanized Hindi titles */
const TITLES = [
  // ---------- Hindi movies ----------
  ['sholay', 'movie'],
  ['dilwale dulhania le jayenge', 'movie', 'ddlj'],
  ['kabhi khushi kabhie gham', 'movie', 'k3g'],
  ['3 idiots', 'movie'],
  ['dangal', 'movie'],
  ['lagaan', 'movie'],
  ['kuch kuch hota hai', 'movie', 'kkhh'],
  ['hum aapke hain koun', 'movie', 'hahk', 'hum aap ke hain kaun'],
  ['mughal e azam', 'movie'],
  ['pyaasa', 'movie'],
  ['mother india', 'movie'],
  ['anand', 'movie'],
  ['chupke chupke', 'movie'],
  ['gol maal', 'movie'],
  ['deewar', 'movie', 'diwar'],
  ['don', 'movie'],
  ['amar akbar anthony', 'movie'],
  ['mr india', 'movie'],
  ['maine pyar kiya', 'movie'],
  ['jo jeeta wohi sikandar', 'movie'],
  ['hum dil de chuke sanam', 'movie'],
  ['devdas', 'movie'],
  ['veer zaara', 'movie'],
  ['kal ho naa ho', 'movie', 'khnh', 'kal ho na ho'],
  ['chak de india', 'movie'],
  ['jab we met', 'movie', 'jwm'],
  ['taare zameen par', 'movie', 'tzp', 'tare zameen par'],
  ['rang de basanti', 'movie', 'rdb'],
  ['om shanti om', 'movie', 'oso'],
  ['ghajini', 'movie'],
  ['rab ne bana di jodi', 'movie', 'rnbdj'],
  ['chennai express', 'movie'],
  ['bajrangi bhaijaan', 'movie'],
  ['pk', 'movie'],
  ['sultan', 'movie'],
  ['padmaavat', 'movie'],
  ['raazi', 'movie'],
  ['uri the surgical strike', 'movie', 'uri'],
  ['gully boy', 'movie'],
  ['kabir singh', 'movie'],
  ['andhadhun', 'movie'],
  ['stree', 'movie'],
  ['drishyam', 'movie'],
  ['queen', 'movie'],
  ['zindagi na milegi dobara', 'movie', 'znmd'],
  ['barfi', 'movie'],
  ['yeh jawaani hai deewani', 'movie', 'yjhd'],
  ['tamasha', 'movie'],
  ['rockstar', 'movie'],
  ['jab tak hai jaan', 'movie'],
  ['aashiqui 2', 'movie', 'ashiqui 2'],
  ['raanjhanaa', 'movie'],
  ['dil bechara', 'movie'],
  ['shershaah', 'movie'],
  ['gangubai kathiawadi', 'movie'],
  ['pathaan', 'movie'],
  ['jawan', 'movie'],
  ['animal', 'movie'],
  ['rocky aur rani kii prem kahaani', 'movie'],
  ['12th fail', 'movie'],
  ['laapataa ladies', 'movie'],
  ['andaz apna apna', 'movie'],
  ['hera pheri', 'movie'],
  ['phir hera pheri', 'movie'],
  ['welcome', 'movie'],
  ['golmaal fun unlimited', 'movie', 'golmaal'],
  ['bhool bhulaiyaa', 'movie'],
  ['hungama', 'movie'],
  ['dhamaal', 'movie'],
  ['no entry', 'movie'],
  ['housefull', 'movie'],
  ['satya', 'movie'],
  ['company', 'movie'],
  ['gangs of wasseypur', 'movie'],
  ['kaminey', 'movie'],
  ['udaan', 'movie'],
  ['masaan', 'movie'],
  ['piku', 'movie'],
  ['badhaai ho', 'movie'],
  ['shubh mangal saavdhan', 'movie'],
  ['toilet ek prem katha', 'movie'],
  ['pad man', 'movie'],
  ['hindi medium', 'movie'],
  ['article 15', 'movie'],
  ['chhichhore', 'movie'],
  ['super 30', 'movie'],
  ['mission mangal', 'movie'],
  ['war', 'movie'],
  ['tiger zinda hai', 'movie'],
  ['ek tha tiger', 'movie'],
  ['dhoom', 'movie'],
  ['dhoom 2', 'movie'],
  ['koi mil gaya', 'movie'],
  ['krrish', 'movie'],
  ['jodhaa akbar', 'movie'],
  ['bajirao mastani', 'movie'],
  ['hum tum', 'movie'],
  ['salaam namaste', 'movie'],
  ['fanaa', 'movie'],
  ['kabhi alvida naa kehna', 'movie', 'kank'],
  ['dostana', 'movie'],
  ['wake up sid', 'movie'],
  ['love aaj kal', 'movie'],
  ['band baaja baaraat', 'movie'],
  ['english vinglish', 'movie'],
  ['kapoor and sons', 'movie'],
  ['dear zindagi', 'movie'],
  ['hum saath saath hain', 'movie'],
  ['dilwale', 'movie'],
  ['happy new year', 'movie'],
  ['mohabbatein', 'movie'],
  ['dil to pagal hai', 'movie'],
  ['aradhana', 'movie'],
  ['bobby', 'movie'],
  ['qayamat se qayamat tak', 'movie'],
  ['ishq', 'movie'],
  ['judwaa', 'movie'],
  ['coolie no 1', 'movie'],
  ['raja babu', 'movie'],
  ['baazigar', 'movie'],
  ['darr', 'movie'],
  ['karan arjun', 'movie'],
  ['soldier', 'movie'],
  ['luka chuppi', 'movie'],
  ['sonu ke titu ki sweety', 'movie'],
  ['munna bhai m b b s', 'movie', 'munna bhai mbbs', 'mbbs'],
  ['lage raho munna bhai', 'movie'],
  ['sanju', 'movie'],
  ['dunki', 'movie'],
  ['fighter', 'movie'],
  // ---------- Hindi songs ----------
  ['chaiyya chaiyya', 'song', 'chaiya chaiya'],
  ['kala chashma', 'song'],
  ['baby doll', 'song'],
  ['chammak challo', 'song'],
  ['tum hi ho', 'song'],
  ['kal ho naa ho', 'song', 'kal ho na ho'],
  ['jai ho', 'song'],
  ['senorita', 'song'],
  ['london thumakda', 'song'],
  ['bole chudiyan', 'song'],
  ['ghungroo', 'song'],
  ['sheila ki jawani', 'song'],
  ['munni badnaam hui', 'song'],
  ['dhoom machale', 'song', 'dhoom machale dhoom'],
  ['mauja hi mauja', 'song'],
  ['kajra re', 'song'],
  ['beedi', 'song', 'beedi jalaile'],
  ['desi girl', 'song'],
  ['mere rashke qamar', 'song'],
  ['tera ban jaunga', 'song'],
  ['galliyan', 'song'],
  ['tum se hi', 'song'],
  ['kabira', 'song'],
  ['balam pichkari', 'song'],
  ['dil chahta hai', 'song'],
  ['tu jaane na', 'song'],
  ['pehla nasha', 'song'],
  ['tujhe dekha toh yeh jaana sanam', 'song'],
  ['kuch kuch hota hai', 'song'],
  ['mere sapno ki rani', 'song'],
  ['dum maro dum', 'song'],
  ['yeh ladka hai deewana', 'song'],
  ['aankhon mein teri', 'song'],
  ['o re piya', 'song'],
  ['koi kahe kehta rahe', 'song'],
  ['deewangi deewangi', 'song'],
  ['kar gayi chull', 'song'],
  ['tattad tattad', 'song'],
  ['badtameez dil', 'song'],
  ['chikni chameli', 'song'],
  ['lungi dance', 'song'],
  ['selfie le le re', 'song'],
  ['nachde ne saare', 'song'],
  ['sunny sunny', 'song'],
  ['lag jaa gale', 'song'],
  ['pyar hua iqrar hua', 'song'],
  ['ajeeb dastan hai yeh', 'song'],
  ['mera joota hai japani', 'song'],
  ['awara hoon', 'song', 'aawara hoon'],
  ['chura liyaa hai tumne', 'song'],
  ['yeh dosti', 'song', 'yeh dosti hum nahi todenge'],
  ['roop tera mastana', 'song'],
  ['do lafzon ki hai', 'song'],
  ['ek ladki ko dekha toh aisa laga', 'song'],
  ['papa kehte hain', 'song'],
  ['kehna hi kya', 'song'],
  ['dilbar dilbar', 'song'],
  ['humko humise chura lo', 'song'],
  ['tamma tamma loge', 'song'],
  ['tu cheez badi hai mast', 'song'],
  ['bombay nagariya', 'song'],
  ['ainvayi ainvayi', 'song'],
  ['genda phool', 'song'],
  ['kesariya', 'song'],
  ['pani da rang', 'song'],
  ['galla goodiyan', 'song'],
  ['kar har maidaan fateh', 'song'],
  ['swag se swagat', 'song'],
  ['tera hone laga hoon', 'song'],
  ['jashn e bahaara', 'song'],
  ['tujh mein rab dikhta hai', 'song'],
  ['gerua', 'song'],
  ['janam janam', 'song'],
  ['agar tum saath ho', 'song'],
  ['kabhi kabhi aditi', 'song'],
  ['subah hone na de', 'song'],
  ['phir le aaya dil', 'song'],
  ['ilahi', 'song'],
  ['khalibali', 'song'],
  ['first class', 'song'],
  ['radha', 'song'],
  ['koi mil gaya', 'song'],
  ['its the time to disco', 'song'],
  ['tum hi aana', 'song'],
  ['apna time aayega', 'song'],
  ['dil diyan gallan', 'song'],
  ['jumma chumma de de', 'song'],
  ['aati kya khandala', 'song'],
  ['kambakht ishq', 'song'],
  ['fevicol se', 'song'],
  ['anarkali disco chali', 'song'],
  ['tune maari entriyaan', 'song'],
  ['marjaani', 'song'],
  ['hua hain aaj pehli baar', 'song'],
  ['bekhayali', 'song'],
  ['teri deewani', 'song'],
  ['jhalak dikhla ja', 'song'],
  ['bijli', 'song'],
  ['shaitan ka saala', 'song'],
  ['what jhumka', 'song'],
  ['zingaat', 'song'],
  ['laila main laila', 'song'],
  ['jhume jo pathaan', 'song'],
  ['besharam rang', 'song'],
  ['soch na sake', 'song'],
  ['khuda jaane', 'song'],
  ['nazar na lag jaye', 'song'],
];

/* normalize a guess: lowercase, strip punctuation & filler, and fold
   common Hindi romanization variants (aa→a, ee→i, oo→u, w→v) so that
   "naa ho" matches "na ho", "deewar" matches "diwar", etc. Applied to
   BOTH sides so matching only ever gets more forgiving. */
function norm(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|is|are|it's|its|of|to)\b/g, ' ')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ii/g, 'i')
    .replace(/uu/g, 'u')
    .replace(/w/g, 'v')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 3 options, always mixing a movie and a song */
function pickOptions() {
  const movies = TITLES.filter(x => x[1] === CAT_MOVIE);
  const songs = TITLES.filter(x => x[1] === CAT_SONG);
  const out = [movies[Math.floor(Math.random() * movies.length)], songs[Math.floor(Math.random() * songs.length)]];
  const rest = TITLES.filter(x => !out.includes(x));
  out.push(rest[Math.floor(Math.random() * rest.length)]);
  return shuffle(out);
}

function titleText(entry) { return entry[0]; }
function titleCat(entry) { return entry[1]; }
function titleAliases(entry) { return entry.slice(2); }

function createGame(cfg, now) {
  const seats = cfg.seats.map(s => ({
    id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro',
    team: (s.team === 0 || s.team === 1) ? s.team : -1,
  }));
  const solo = seats.length === 1;
  const teamCount = solo ? 1 : 2;
  // honor lobby/preset teams, else alternate
  seats.forEach((s, i) => {
    if (s.team === -1) s.team = teamCount === 2 ? i % 2 : 0;
  });
  const teams = [[], []];
  seats.forEach(s => teams[s.team].push(s.id));
  const roundsPerTeam = Math.max(1, Math.min(5, +cfg.roundsPerTeam || (solo ? 5 : 3)));
  const roundsTotal = roundsPerTeam * teamCount;
  const teamNames = solo ? ['You'] : ['Team A', 'Team B'];
  return {
    phase: 'choose',          // choose -> act -> reveal -> (repeat) -> over
    seats,
    solo,
    teamCount,
    teams,
    teamNames,
    roundsPerTeam,
    roundsTotal,
    round: 1,
    teamIdx: 0,               // whose turn to act
    actorIdx: teams.map(() => 0), // next actor within each team
    actor: teams[0][0],
    wordOptions: pickOptions(),
    word: null,
    category: null,
    revealed: false,
    correctBy: null,
    scores: Array(teamCount).fill(0),
    guesses: [],
    guessedBy: new Set(),
    roundEndsAt: now + CHOOSE_SECS * 1000,
    winnerTeam: null,
    lastAction: null,
    moveNo: 0,
    local: !!cfg.local,
  };
}

function teamOf(g, seatId) {
  const s = g.seats.find(x => x.id === seatId);
  return s ? s.team : -1;
}

function apply(g, seatId, action, now) {
  const seat = g.seats.find(s => s.id === seatId);
  if (!seat) return { ok: false, error: 'Not in the game.' };
  const t = action.t;

  if (t === 'pickWord') {
    if (g.phase !== 'choose') return { ok: false, error: 'No title to pick right now.' };
    if (seatId !== g.actor) return { ok: false, error: 'Only the actor picks the title.' };
    const idx = +action.idx;
    if (!g.wordOptions[idx]) return { ok: false, error: 'Invalid choice.' };
    g.word = titleText(g.wordOptions[idx]);
    g.category = titleCat(g.wordOptions[idx]);
    g.phase = 'act';
    g.revealed = false;
    g.roundEndsAt = now + ACT_SECS * 1000;
    g.lastAction = { type: 'word', by: seatId, moveNo: ++g.moveNo };
    return { ok: true };
  }

  if (t === 'guess') {
    if (g.phase !== 'act' || g.revealed) return { ok: false, error: 'No guessing right now.' };
    if (seatId === g.actor) return { ok: false, error: 'You are the actor!' };
    if (teamOf(g, seatId) !== g.seats.find(x => x.id === g.actor).team) return { ok: false, error: 'Only your team can guess!' };
    // teammates may guess as many times as they like (real charades!)
    const text = String(action.text || '').replace(/[<>&]/g, '').trim().slice(0, 40);
    if (!text) return { ok: false };
    const entry = { name: seat.name, text, correct: false, at: now };
    g.guesses.push(entry);
    if (g.guesses.length > 40) g.guesses.shift();
    const n = norm(text);
    const titleEntry = TITLES.find(x => x[0] === g.word) || [];
    const hit = n === norm(g.word) || titleEntry.slice(2).some(a => n === norm(a));
    if (hit) {
      entry.correct = true;
      g.correctBy = seatId;
      g.revealed = true;
      g.guessedBy.add(seatId);
      g.scores[teamOf(g, seatId)]++;
      g.lastAction = { type: 'correct', by: seatId, team: teamOf(g, seatId), word: g.word, moveNo: ++g.moveNo };
      g.phase = 'reveal';
      g.roundEndsAt = now + REVEAL_SECS * 1000;
      return { ok: true, correct: true };
    }
    return { ok: true, correct: false };
  }

  if (t === 'localGotIt') {
    if (!g.local || g.solo) return { ok: false };
    if (g.phase !== 'act' || g.revealed) return { ok: false, error: 'No one can get it right now.' };
    const by = g.seats.find(s => s.id === action.by && s.id !== g.actor && teamOf(g, s.id) === teamOf(g, g.actor));
    if (!by) return { ok: false, error: 'Pick a teammate.' };
    g.revealed = true;
    g.correctBy = by.id;
    g.guessedBy.add(by.id);
    g.scores[teamOf(g, by.id)]++;
    g.guesses.push({ name: by.name, text: 'got it!', correct: true, at: now });
    g.lastAction = { type: 'correct', by: by.id, team: teamOf(g, by.id), word: g.word, moveNo: ++g.moveNo };
    g.phase = 'reveal';
    g.roundEndsAt = now + REVEAL_SECS * 1000;
    return { ok: true };
  }

  if (t === 'soloGotIt') {
    if (!g.solo) return { ok: false };
    if (g.phase !== 'act' || g.revealed) return { ok: false };
    if (seatId !== g.actor) return { ok: false };
    g.revealed = true;
    g.correctBy = seatId;
    g.scores[0]++;
    g.guesses.push({ name: seat.name, text: 'got it!', correct: true, at: now });
    g.lastAction = { type: 'correct', by: seatId, word: g.word, moveNo: ++g.moveNo };
    g.phase = 'reveal';
    g.roundEndsAt = now + REVEAL_SECS * 1000;
    return { ok: true };
  }

  if (t === 'pass') {
    // actor gives up (online); party mode: anyone can skip
    if (g.phase !== 'act' || g.revealed) return { ok: false };
    if (!g.local && seatId !== g.actor) return { ok: false, error: 'Only the actor can pass.' };
    g.revealed = true;
    g.phase = 'reveal';
    g.roundEndsAt = now + REVEAL_SECS * 1000;
    g.lastAction = { type: 'pass', by: seatId, word: g.word, moveNo: ++g.moveNo };
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* choose-phase timeout: server picks a random title for the actor */
function autoPick(g, now) {
  if (g.phase !== 'choose') return;
  g.word = titleText(g.wordOptions[Math.floor(Math.random() * g.wordOptions.length)]);
  g.category = titleCat(g.wordOptions[g.wordOptions.findIndex(x => x[0] === g.word)]);
  g.phase = 'act';
  g.roundEndsAt = now + ACT_SECS * 1000;
  g.lastAction = { type: 'word', by: g.actor, auto: true, moveNo: ++g.moveNo };
}

/* act-phase timeout: reveal the title */
function reveal(g, now) {
  if (g.phase !== 'act') return { ok: false };
  g.revealed = true;
  g.phase = 'reveal';
  g.roundEndsAt = now + REVEAL_SECS * 1000;
  g.lastAction = { type: 'timeout', word: g.word, moveNo: ++g.moveNo };
  return { ok: true };
}

/* reveal pause over: next team's turn or game over */
function nextRound(g, now) {
  if (g.phase !== 'reveal') return { ok: false };
  if (g.round >= g.roundsTotal) {
    g.phase = 'over';
    let best = -1;
    for (let t = 0; t < g.teamCount; t++) {
      if (g.scores[t] > best) { best = g.scores[t]; g.winnerTeam = t; }
      else if (g.scores[t] === best) g.winnerTeam = null; // tie
    }
    return { ok: true, over: true };
  }
  g.round++;
  g.actorIdx[g.teamIdx]++;                       // next actor in the team that just acted
  g.teamIdx = (g.teamIdx + 1) % g.teamCount;     // alternate teams
  const team = g.teams[g.teamIdx];
  g.actor = team[g.actorIdx[g.teamIdx] % team.length];
  g.wordOptions = pickOptions();
  g.word = null;
  g.category = null;
  g.revealed = false;
  g.correctBy = null;
  g.guesses = [];
  g.guessedBy.clear();
  g.phase = 'choose';
  g.roundEndsAt = now + CHOOSE_SECS * 1000;
  return { ok: true, over: false };
}

function publicState(g, viewerSeatId) {
  const actorSeat = g.seats.find(s => s.id === g.actor);
  const teamOfViewer = teamOf(g, viewerSeatId);
  return {
    phase: g.phase,
    round: g.round,
    roundsTotal: g.roundsTotal,
    roundEndsAt: g.roundEndsAt,
    solo: g.solo,
    teamCount: g.teamCount,
    teamNames: g.teamNames.slice(),
    teamIdx: g.teamIdx,
    teams: g.teams.map((ids, t) => ({
      name: g.teamNames[t],
      members: ids.map(id => (g.seats.find(s => s.id === id) || {}).name || ''),
    })),
    scores: g.scores.slice(),
    actor: g.actor,
    actorName: actorSeat ? actorSeat.name : '',
    actorTeam: actorSeat ? actorSeat.team : 0,
    isActor: g.actor === viewerSeatId,
    canGuess: !g.local && !g.solo && g.phase === 'act' && !g.revealed &&
      g.actor !== viewerSeatId && teamOfViewer === (actorSeat ? actorSeat.team : -1) && !g.guessedBy.has(viewerSeatId),
    wordOptions: g.phase === 'choose' && (g.actor === viewerSeatId || g.local)
      ? g.wordOptions.map(x => ({ title: titleText(x), category: titleCat(x) }))
      : [],
    word: g.phase !== 'choose' && (g.revealed || g.actor === viewerSeatId || g.local) ? g.word : null,
    category: g.phase !== 'choose' && (g.revealed || g.actor === viewerSeatId || g.local) ? g.category : null,
    revealed: g.revealed,
    correctBy: g.correctBy,
    guesses: g.guesses,
    winnerTeam: g.winnerTeam,
    lastAction: g.lastAction,
    moveNo: g.moveNo,
  };
}

module.exports = {
  TITLES, CAT_MOVIE, CAT_SONG, CAT_LABEL, CHOOSE_SECS, ACT_SECS, REVEAL_SECS,
  norm, pickOptions, createGame, apply, autoPick, reveal, nextRound, publicState,
};
