/*
 * VeneraCat novel-js source for 笔趣阁365 (https://www.biquge365.net).
 * Original first-party plugin, LGPL-3.0-or-later.
 */
class Biquge365 extends NovelSource {
  name = "笔趣阁365"
  key = "biquge365"
  version = "1.0.0"
  minAppVersion = "1.0.0"
  url = "https://www.biquge365.net"
  author = { name: "VeneraCat", url: "https://github.com/laincat/VeneraCat-Sources" }
  homepage = "https://www.biquge365.net"

  _cheerio() {
    return LNReaderAdapter.createRequire(this)("cheerio")
  }

  _abs(href) {
    if (!href) return ""
    try { return new URL(href, this.url).toString() } catch (_) { return href }
  }

  async popular(page) {
    const p = Number(page) > 1 ? Number(page) : 1
    const res = await Network.get(this.url + "/sort/1_" + p + "/")
    if (res.status < 200 || res.status >= 300) throw new Error("biquge365: popular HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const items = []
    const seen = new Set()
    $("a[href^='/book/']").each((_, el) => {
      const $a = $(el)
      const href = $a.attr("href") || ""
      if (!/^\/book\/\d+\/$/.test(href) || seen.has(href)) return
      const title = $a.text().trim()
      if (!title) return
      seen.add(href)
      items.push({ id: this._abs(href), title })
    })
    return { items }
  }

  async search(keyword, page) {
    const res = await Network.post(
      this.url + "/s.php",
      {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": this.url + "/"
      },
      "type=articlename&s=" + encodeURIComponent(keyword)
    )
    if (res.status < 200 || res.status >= 300) throw new Error("biquge365: search HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const items = []
    const seen = new Set()
    $("ul.search li").each((_, el) => {
      const $li = $(el)
      if ($li.hasClass("fen")) return
      const $a = $li.find("span.name a").first()
      const href = $a.attr("href") || ""
      const title = $a.text().trim()
      if (!href || !title || seen.has(href)) return
      seen.add(href)
      const author = $li.find("span.zuo").text().trim()
      const item = { id: this._abs(href), title }
      if (author) item.author = author
      items.push(item)
    })
    return { items, maxPage: 1 }
  }

  async detail(id) {
    const bookUrl = this._abs(id)
    const res = await Network.get(bookUrl)
    if (res.status < 200 || res.status >= 300) throw new Error("biquge365: detail HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const title = $("h1").first().text().trim() || $("meta[property='og:title']").attr("content") || ""
    const author = ($("meta[property='og:novel:author']").attr("content") || "").trim()
    const summary = ($("meta[property='og:description']").attr("content") || $("div.intro").text() || "").trim()
    const cover = this._abs($("meta[property='og:image']").attr("content") || $("div.img img").attr("src") || "")
    const status = ($("meta[property='og:novel:status']").attr("content") || "").trim()
    const cat = ($("meta[property='og:novel:category']").attr("content") || "").trim()
    const chapters = []
    const seen = new Set()
    $("a[href^='/chapter/']").each((_, el) => {
      const $a = $(el)
      const href = $a.attr("href") || ""
      const ctitle = $a.text().trim()
      if (!href || !ctitle || seen.has(href)) return
      seen.add(href)
      chapters.push({ id: this._abs(href), title: ctitle })
    })
    return {
      id: bookUrl,
      title,
      cover,
      author,
      summary,
      status,
      tags: cat ? [cat] : [],
      chapters
    }
  }

  async chapter(novelId, chapId) {
    const url = this._abs(chapId)
    const res = await Network.get(url)
    if (res.status < 200 || res.status >= 300) throw new Error("biquge365: chapter HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const $box = $("#txt, #content").first()
    $box.find("script, style, ins").remove()
    const html = ($box.html() || "").trim()
    if (!html) throw new Error("biquge365: empty chapter content")
    return { html }
  }
}
