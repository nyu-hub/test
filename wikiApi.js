// wikiApi.js
// Wikipedia API 호출 + 응답 처리 전담

// 언어에 따라 도메인만 바꿔줌
function getWikiBaseUrl(lang) {
  return lang === "ko"
    ? "https://ko.wikipedia.org"
    : "https://en.wikipedia.org";
}

// 위키 URL 만들기
function buildWikiUrl(keyword, lang) {
  const base = getWikiBaseUrl(lang);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    explaintext: "1",
    generator: "search",
    gsrlimit: "1",
    gsrsearch: keyword,
    origin: "*",
  });

  return `${base}/w/api.php?${params.toString()}`;
}

/* =========================================================
   ✅ 핵심문장 “원문 위치 하이라이트”를 위한 렌더링 유틸
   ========================================================= */

function _escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 한 줄(line)을 문장 단위로 분리 (구두점 유지)
function _splitLineToSentences(line) {
  const s = String(line).trim();
  if (!s) return [];
  // 마침표/물음표/느낌표/중국어/일본어 구두점까지 포함
  const parts = s.split(/(?<=[\.\?\!。？！])\s+/);
  return parts.filter((p) => p && p.trim().length > 0);
}

// extract(plain text)를 “문장 span + 줄바꿈” HTML로 렌더
function _renderExtractAsSentenceSpans(extract) {
  const lines = String(extract).replace(/\r/g, "").split("\n");

  let idx = 0;
  let html = "";

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // 빈 줄은 그대로 줄바꿈만
    if (!line.trim()) {
      html += "<br>";
      continue;
    }

    const sents = _splitLineToSentences(line);

    // 문장 분리가 실패하면 줄 자체를 1문장으로
    const finalSents = sents.length ? sents : [line];

    for (const sent of finalSents) {
      const safe = _escapeHtml(sent);
      html += `<span class="cs-sent" data-sent="${idx}">${safe}</span> `;
      idx++;
    }

    // 원문 문단 느낌 살리기: 줄 끝에 <br>
    html += "<br>";
  }

  return html;
}

/* ========================================================= */

// Wikipedia 데이터 받아서 전역 상태 + contentDiv(#wikiContent) 업데이트
function handleWikiData(data, lang) {
  if (!data || !data.query || !data.query.pages) {
    summaryP.html("검색 결과가 없습니다.");
    fullExtract = "";
    currentTitle = "";
    return;
  }

  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  const page = pages[pageId];

  const title = page.title || keyword;
  const extract = page.extract || "";

  currentTitle = title;
  fullExtract = extract;

  if (!extract) {
    summaryP.html(`${title} 문서에서 텍스트를 찾지 못했습니다.`);
    return;
  }

  // ✅ 제목은 statusLine에서 보여주고,
  // ✅ 본문(div#wikiContent)에는 문장 span만 렌더한다.
  const html = _renderExtractAsSentenceSpans(extract);
  summaryP.html(html);
}

function handleWikiError(err) {
  console.error(err);
  summaryP.html("에러: Wikipedia 데이터를 불러오지 못했습니다.");
  fullExtract = "";
  currentTitle = "";
}
