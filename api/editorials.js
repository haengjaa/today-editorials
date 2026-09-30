// 매일경제 사설 목록 페이지에서 최신 사설 3개를 가져오는 서버 코드
// 주소: /api/editorials  (Vercel이 이 파일을 자동으로 서버 기능으로 실행합니다)

const LIST_URL = 'https://www.mk.co.kr/opinion/editorial/';
const HOW_MANY = 3;

// HTML 특수문자(&quot; 등)를 원래 글자로 바꿉니다
function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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

// 사설 목록 페이지 HTML에서 제목·링크·날짜·첫 문장을 뽑아냅니다
function parseList(html) {
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
      id: m[2],
      url: m[1],
      title: clean(m[3]).replace(/\s*\[사설\]\s*$/, ''),
      date: dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : '',
      summary: firstSentence(clean(m[4])),
    });
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TodayEditorials/1.0)',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!r.ok) throw new Error('매일경제 응답 코드 ' + r.status);
    const html = await r.text();
    const items = parseList(html);
    if (!items.length) throw new Error('사설을 찾지 못했습니다 (사이트 구조가 바뀌었을 수 있음)');

    // 10분 동안은 같은 결과를 재사용해서 신문사 서버에 부담을 줄입니다
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json({ paper: '매일경제', updatedAt: new Date().toISOString(), items });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
