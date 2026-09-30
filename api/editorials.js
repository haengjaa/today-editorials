// 신문사별 최신 사설 3개를 가져오는 서버 코드
// 주소: /api/editorials  (Vercel이 이 파일을 자동으로 서버 기능으로 실행합니다)

const HOW_MANY = 3;
// 일반 크롬 브라우저와 같은 모양으로 요청합니다 (보안 서비스가 로봇으로 오해하지 않도록)
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

/* ───────── 공통 도우미 함수 ───────── */

// HTML 특수문자(&quot;, &middot; 등)를 원래 글자로 바꿉니다
const ENT = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—' };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

// HTML 태그를 지우고 공백을 정리합니다
function clean(s) {
  return decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// 첫 문장만 잘라냅니다 (마침표·물음표·느낌표 뒤에 공백이 오는 곳까지)
function firstSentence(text) {
  const m = text.match(/^.*?[.?!](?=\s|$)/);
  return m ? m[0] : text;
}

// 제목에서 "[사설]" 표시를 지웁니다 (앞에 붙든 뒤에 붙든)
function stripTag(title) {
  return title.replace(/\s*\[사설\]\s*/, ' ').trim();
}

// 웹페이지 내용을 글자로 받아옵니다
async function getText(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(url + ' 응답 코드 ' + r.status);
  return r.text();
}

/* ───────── 매일경제: 사설 목록 페이지를 읽습니다 ───────── */

async function fetchMk() {
  const html = await getText('https://www.mk.co.kr/opinion/editorial/');
  const start = html.indexOf('id="list_area"');
  const part = start >= 0 ? html.slice(start) : html;
  const re = /<a href="(https:\/\/www\.mk\.co\.kr\/news\/editorial\/(\d+))"[^>]*>[\s\S]*?<h4>([\s\S]*?)<\/h4>[\s\S]*?<p class="art_desc">([\s\S]*?)<\/p>[\s\S]*?<div class="time_area">\s*<span>([\s\S]*?)<\/span>/g;

  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(part)) && out.length < HOW_MANY) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    const dm = clean(m[5]).match(/(\d{2})\.(\d{2})\s*(\d{4})/); // 예: "09.29 2026"
    out.push({
      id: 'mk-' + m[2],
      url: m[1],
      title: stripTag(clean(m[3])),
      date: dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : '',
      summary: firstSentence(clean(m[4])),
    });
  }
  return out;
}

/* ───────── 한국경제: 오피니언 RSS에서 사설만 고른 뒤, 기사 페이지에서 첫 문장을 읽습니다 ───────── */

// RSS 글자 안의 <![CDATA[ ... ]]> 포장을 벗깁니다
function cdata(s) {
  return (s || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

// RSS에서 기사 목록(제목·링크·날짜)을 뽑습니다
function parseRss(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const get = tag => cdata((m[1].match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>')) || [])[1]);
    out.push({ title: decode(get('title')), link: get('link'), pubDate: get('pubDate'), content: get('content:encoded') });
  }
  return out;
}

// 한국경제 기사 페이지에서 본문 글자만 뽑습니다
function hkBody(html) {
  const i = html.indexOf('id="articletxt"');
  if (i < 0) return '';
  let s = html.slice(html.indexOf('>', i) + 1);
  const end = s.search(/<!--\s*Begin Dable|<div class="article-body-bottom|<\/div>\s*<\/div>/);
  if (end > 0) s = s.slice(0, end);
  s = s
    .replace(/<(figure|script|style|figcaption|table)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*(figure|photo|img|ad)[^"]*"[\s\S]*?<\/div>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ');
  return clean(s);
}

// 날짜를 한국 시간 기준 "2026-09-29" 모양으로 바꿉니다
function toKstDate(pubDate) {
  const d = new Date(pubDate);
  return isNaN(d) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

async function fetchHankyung() {
  const xml = await getText('https://www.hankyung.com/feed/opinion');
  const editorials = parseRss(xml)
    .filter(x => x.title.includes('[사설]'))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, HOW_MANY);

  // 기사 3개를 동시에 읽어서 첫 문장을 구합니다
  return Promise.all(editorials.map(async e => {
    let summary = '';
    try { summary = firstSentence(hkBody(await getText(e.link))); } catch { /* 본문을 못 읽어도 제목은 보여줍니다 */ }
    return {
      id: 'hankyung-' + (e.link.match(/(\d+)\/?$/) || [])[1],
      url: e.link,
      title: stripTag(e.title),
      date: toKstDate(e.pubDate),
      summary: summary || '본문을 불러오지 못했습니다.',
    };
  }));
}

/* ───────── 조선일보: 오피니언 RSS에 본문 전체가 들어 있어서 RSS만 읽습니다 ───────── */

// RSS 본문(HTML)에서 사진·영상 등을 빼고 글자만 남깁니다
function chosunBody(html) {
  const raw = /^\s*&lt;/.test(html) ? decode(html) : html; // 본문이 한 번 더 감싸져 온 경우 대비
  return clean(
    raw
      .replace(/<(figure|script|style|figcaption|table)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<img[^>]*>/gi, ' ')
  );
}

async function fetchChosun() {
  const xml = await getText('https://www.chosun.com/arc/outboundfeeds/rss/category/opinion/?outputType=xml');
  return parseRss(xml)
    .filter(x => x.link.includes('/opinion/editorial/')) // 사설만 고릅니다
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, HOW_MANY)
    .map(e => ({
      id: 'chosun-' + (e.link.match(/\/([A-Z0-9]+)\/?$/) || [])[1],
      url: e.link,
      title: stripTag(e.title),
      date: toKstDate(e.pubDate),
      summary: firstSentence(chosunBody(e.content)) || '본문을 불러오지 못했습니다.',
    }));
}

/* ───────── 신문사 목록: 새 신문사는 여기에 한 줄씩 추가합니다 ───────── */

const PAPERS = [
  { key: 'chosun', name: '조선일보', fetch: fetchChosun },
  { key: 'mk', name: '매일경제', fetch: fetchMk },
  { key: 'hankyung', name: '한국경제', fetch: fetchHankyung },
];

module.exports = async (req, res) => {
  // 신문사들을 동시에 가져옵니다. 한 곳이 실패해도 나머지는 그대로 보여줍니다.
  const results = await Promise.allSettled(PAPERS.map(p => p.fetch()));
  const papers = PAPERS.map((p, i) => {
    const r = results[i];
    return r.status === 'fulfilled'
      ? { key: p.key, name: p.name, items: r.value }
      : { key: p.key, name: p.name, items: [], error: String(r.reason?.message || r.reason) };
  });

  // 10분 동안은 같은 결과를 재사용해서 신문사 서버에 부담을 줄입니다
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({ updatedAt: new Date().toISOString(), papers });
};
