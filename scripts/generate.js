// 매일 오늘의 패턴 5개(원어민 표현 3 + 문법 패턴 2) + 단어 5개를 Claude로 생성해 content/YYYY-MM-DD.json 으로 저장
// GitHub Actions에서 실행됨. API 키는 ANTHROPIC_API_KEY 시크릿으로 주입.
const fs = require('fs');
const path = require('path');

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY 가 없습니다.'); process.exit(1); }

// 한국 시간(KST) 기준 오늘 날짜
function todayKST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

const CONTENT_DIR = path.join(__dirname, '..', 'content');
fs.mkdirSync(CONTENT_DIR, { recursive: true });

const dateKey = process.argv[2] || todayKST();
const outFile = path.join(CONTENT_DIR, `${dateKey}.json`);

if (fs.existsSync(outFile)) {
  console.log(`이미 존재: ${dateKey}.json — 건너뜀`);
  process.exit(0);
}

// 지금까지 쓴 단어/패턴을 각각 모아 중복 방지 (패턴은 반복이 잦으므로 전체 이력을 본다)
const usedWords = new Set();
const usedPhrases = new Set();
// 문구 비교용 정규화: 대소문자·문장부호·공백 제거 → 표현이 같으면 중복으로 간주
const normPhrase = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const f of fs.readdirSync(CONTENT_DIR)) {
  if (!f.endsWith('.json')) continue;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    (d.words || []).forEach(w => usedWords.add((w.word || '').toLowerCase().trim()));
    (d.patterns || []).forEach(p => usedPhrases.add(normPhrase(p.pattern)));
  } catch {}
}
// 표시용 원문 문구도 함께 모아 프롬프트에 넣는다 (전체 이력 — 최근 것만 자르면 그 이전 표현이 다시 나올 수 있다)
const phraseList = [];
const files = fs.readdirSync(CONTENT_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    (d.patterns || []).forEach(p => { if (p.pattern) phraseList.push(p.pattern); });
  } catch {}
}
const avoidPhrases = phraseList.join(' / ');
const avoidWords = [...usedWords].join(', ');

const prompt = `너는 한국인 영어 학습자를 위한 콘텐츠 생성기다. 오늘의 학습 자료를 JSON으로만 출력하라. 설명·코드블록·마크다운 없이 순수 JSON만.

구성:
- patterns: 총 5개. 아래 순서대로 배열에 넣어라.
  * 앞의 3개: 미국 현지인이 일상 대화에서 실제로 자주 쓰는 자연스러운 "문구/표현".
    - 문법 공식이 아니라, 그대로 입에서 나오는 관용적 구어체 표현이어야 한다.
    - 예: "No worries.", "Let me get back to you.", "That works for me.", "I'm on it.", "It's up to you.", "Long story short,", "Give me a heads-up.", "My bad.", "Let's play it by ear." 같은 실제 원어민이 쓰는 문구.
    - 지나치게 격식적이거나 교과서적인 문장은 피하고, 친구·동료·가게 등에서 실제로 들리는 표현으로.
    - pattern 필드에는 표현 자체를 넣는다(문법 자리표시자 금지).
  * 마지막 2개: 실용적인 영어 "문법 회화 패턴"(빈칸 채우기형 공식).
    - 예: "I'd rather + 동사원형 + than + 동사원형", "It turns out (that) + 주어 + 동사", "I was about to + 동사원형", "feel free to + 동사원형" 처럼 자리표시자가 들어간 응용 가능한 패턴.
    - pattern 필드에 이런 공식 형태를 넣는다.
    - 두 패턴은 서로 다른 문법 요소(시제·조동사·가정법·비교·관계사 등)를 다루도록 하고, 형태가 비슷한 것끼리 넣지 마라.
  * 각 항목 형식: {pattern(영어 표현/패턴), meaning(한국어 의미·뉘앙스), example(자연스러운 대화체 예문), example_kr(예문 번역)}
- words: 실용 영어 단어 5개. {word, phonetic(IPA 발음기호 예 /ˈhæpi/), meaning(한국어 뜻), example(영어 예문), example_kr(예문 번역)}

난이도 중급. 일상·여행·업무 활용도 높은 것으로. 매일 서로 다른 상황(식당·직장·친구·여행·전화 등)에서 골라 다양성을 확보하라.
같은 날 안에서도 중복 금지 — patterns 5개끼리, words 5개끼리 서로 겹치는 항목이 하나도 없어야 한다.
${avoidPhrases ? `\n다음 문구들은 이미 사용했으니 의미가 겹치는 표현도 포함해 절대 중복 금지:\n${avoidPhrases}` : ''}
${avoidWords ? `\n이미 사용한 단어(중복 금지): ${avoidWords}` : ''}

형식:
{"patterns":[{"pattern":"","meaning":"","example":"","example_kr":""}],"words":[{"word":"","phonetic":"","meaning":"","example":"","example_kr":""}]}`;

async function callModel(extra) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt + (extra || '') }]
    })
  });
  if (!res.ok) {
    console.error('API 오류:', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  let txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  txt = txt.replace(/```json|```/g, '').trim();

  // 응답이 잘렸는지 확인 (정상 종료가 아니면 실패 처리)
  if (data.stop_reason && data.stop_reason !== 'end_turn') {
    throw new Error(`응답이 완전하지 않습니다 (stop_reason: ${data.stop_reason}). 저장하지 않음.`);
  }

  // 모델이 JSON 앞뒤에 인사말·설명을 덧붙이는 경우가 있어 바깥 { } 구간만 잘라낸다
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  const json = (s > -1 && e > s) ? txt.slice(s, e + 1) : txt;

  try {
    return normalizeDay(JSON.parse(json));
  } catch (err) {
    throw new Error('JSON 파싱 실패 (응답이 잘렸을 수 있음). 응답 일부: ' + txt.slice(-200));
  }
}

// 모델이 가끔 {"data":{...}} 처럼 한 겹 감싸거나 배열 대신 객체 맵으로 주는 것을 표준 형태로 되돌린다
function normalizeDay(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  // 한 겹 감싼 경우: patterns/words 를 가진 하위 객체를 찾아 끌어올린다
  if (!obj.patterns && !obj.words) {
    const inner = Object.values(obj).find(v => v && typeof v === 'object' && (v.patterns || v.words));
    if (inner) obj = inner;
  }
  const toArr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : v);
  return { ...obj, patterns: toArr(obj.patterns), words: toArr(obj.words) };
}

// 생성물의 문구/단어가 이미 쓴 것과 겹치는지 검사
// 과거 이력(usedPhrases/usedWords)뿐 아니라 같은 날 안에서 두 번 나온 것도 중복으로 본다
function findDupes(day) {
  const dupePhrases = [];
  const seenPhrases = new Set();
  for (const p of day.patterns || []) {
    const k = normPhrase(p.pattern);
    if (usedPhrases.has(k) || seenPhrases.has(k)) dupePhrases.push(p.pattern);
    seenPhrases.add(k);
  }
  const dupeWords = [];
  const seenWords = new Set();
  for (const w of day.words || []) {
    const k = (w.word || '').toLowerCase().trim();
    if (usedWords.has(k) || seenWords.has(k)) dupeWords.push(w.word);
    seenWords.add(k);
  }
  return { dupePhrases, dupeWords };
}

const isWellFormed = d => d && Array.isArray(d.patterns) && Array.isArray(d.words);

async function main() {
  // 형식(또는 파싱)이 어긋나면 그날 콘텐츠가 통째로 비므로, 실패해도 바로 포기하지 말고 다시 물어본다
  let day = null;
  const FORMAT_RETRIES = 3;
  for (let attempt = 1; attempt <= FORMAT_RETRIES; attempt++) {
    try {
      const got = await callModel(attempt > 1 ? '\n\n반드시 위 "형식"의 JSON 객체만 출력하라. 최상위에 patterns 배열과 words 배열이 각각 5개씩 있어야 하며, 다른 키로 감싸거나 설명을 덧붙이지 마라.' : '');
      if (isWellFormed(got)) { day = got; break; }
      console.warn(`형식 오류(시도 ${attempt}/${FORMAT_RETRIES}) — 최상위 키: [${Object.keys(got || {}).join(', ')}] → 재요청`);
    } catch (e) {
      console.warn(`응답 처리 실패(시도 ${attempt}/${FORMAT_RETRIES}): ${e.message} → 재요청`);
    }
  }
  if (!day) {
    throw new Error(`형식이 올바르지 않습니다 (patterns/words 배열 아님) — ${FORMAT_RETRIES}회 재시도 실패. 저장하지 않음.`);
  }

  // 중복이 남아있는 한 최대 3회까지 재생성 시도 (겹친 항목만 알려주고 교체 요청)
  const MAX_RETRIES = 3;
  let { dupePhrases, dupeWords } = findDupes(day);
  for (let attempt = 1; attempt <= MAX_RETRIES && (dupePhrases.length || dupeWords.length); attempt++) {
    console.warn(`중복 감지(시도 ${attempt}) — 문구: [${dupePhrases.join(', ')}] 단어: [${dupeWords.join(', ')}] → 재생성 시도`);
    // 재생성이 실패해도 이미 확보한 day 는 유효하므로 버리지 않는다
    try {
      const retry = await callModel(`\n\n방금 생성한 것 중 다음은 이미 사용된 중복이다. 완전히 다른 표현/단어로 전부 교체하라: 문구 [${dupePhrases.join(', ')}] 단어 [${dupeWords.join(', ')}]`);
      if (isWellFormed(retry)) {
        day = retry;
        ({ dupePhrases, dupeWords } = findDupes(day));
      }
    } catch (e) {
      console.warn(`중복 재생성 실패: ${e.message} → 기존 생성물 유지`);
      break;
    }
  }

  // 재시도 후에도 중복이 남으면 — 항목을 제거하면 5개 미만이 되어 그날 콘텐츠 전체가
  // 생성 실패로 이어질 수 있으므로, 드문 중복은 감수하고 그대로 유지한다(콘텐츠 누락이 더 나쁜 실패다).
  if (dupePhrases.length || dupeWords.length) {
    console.warn(`재시도 후에도 남은 중복 — 문구: [${dupePhrases.join(', ')}] 단어: [${dupeWords.join(', ')}] → 콘텐츠 누락 방지를 위해 그대로 유지`);
  }

  // 안전장치: 필수 필드가 빠진 항목은 저장하지 않는다
  const okPattern = p => p && p.pattern && p.meaning && p.example;
  const okWord = w => w && w.word && w.meaning && w.example;
  day.patterns = (day.patterns || []).filter(okPattern);
  day.words = (day.words || []).filter(okWord);

  if (day.patterns.length < 5) {
    throw new Error(`패턴이 부족합니다 (유효 ${day.patterns.length}/5). 빈 콘텐츠 방지를 위해 저장하지 않음.`);
  }
  if (day.words.length < 5) {
    throw new Error(`단어가 부족합니다 (유효 ${day.words.length}/5). 빈 콘텐츠 방지를 위해 저장하지 않음.`);
  }
  day = { patterns: day.patterns.slice(0, 5), words: day.words.slice(0, 5) };

  fs.writeFileSync(outFile, JSON.stringify(day, null, 2), 'utf8');
  console.log(`생성 완료: ${dateKey}.json (패턴 ${day.patterns.length} · 단어 ${day.words.length})`);

  // 날짜 목록(인덱스) 갱신 — 앱이 사용 가능한 날짜를 알 수 있게
  const dates = fs.readdirSync(CONTENT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort();
  fs.writeFileSync(path.join(CONTENT_DIR, 'index.json'), JSON.stringify(dates, null, 2), 'utf8');
  console.log(`index.json 갱신: ${dates.length}일치`);
}

main().catch(e => { console.error(e); process.exit(1); });
