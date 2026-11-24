/*
 * VeneraCat novel-js source for 黑粉小说 (http://m.heifenxs.org).
 * Original first-party plugin, LGPL-3.0-or-later.
 */
class Heifenxs extends NovelSource {
  name = "黑粉小说"
  key = "heifenxs"
  version = "1.0.0"
  minAppVersion = "1.0.0"
  url = "http://m.heifenxs.org"
  author = { name: "VeneraCat", url: "https://github.com/laincat/VeneraCat-Sources" }
  homepage = "http://m.heifenxs.org"

  _cheerio() {
    return LNReaderAdapter.createRequire(this)("cheerio")
  }

  _abs(href) {
    if (!href) return ""
    try { return new URL(href, this.url).toString() } catch (_) { return href }
  }

  async popular(page) {
    const p = Number(page) > 1 ? Number(page) : 1
    const res = await Network.get(this.url + "/sort/1/" + p + ".html")
    if (res.status < 200 || res.status >= 300) throw new Error("heifenxs: popular HTTP " + res.status)
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
      this.url + "/s.html",
      {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": this.url + "/"
      },
      "s=" + encodeURIComponent(keyword) + "&type=articlename"
    )
    if (res.status < 200 || res.status >= 300) throw new Error("heifenxs: search HTTP " + res.status)
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
    return { items, maxPage: 1 }
  }

  async detail(id) {
    const bookUrl = this._abs(id)
    const res = await Network.get(bookUrl)
    if (res.status < 200 || res.status >= 300) throw new Error("heifenxs: detail HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const title = ($("meta[property='og:novel:book_name']").attr("content") || $("h1").first().text() || "").trim()
    const author = ($("meta[property='og:novel:author']").attr("content") || "").trim()
    const summary = ($("meta[property='og:description']").attr("content") || "").trim()
    const cover = this._abs($("meta[property='og:image']").attr("content") || "")
    const status = ($("meta[property='og:novel:status']").attr("content") || "").trim()
    const cat = ($("meta[property='og:novel:category']").attr("content") || "").trim()
    const chapters = []
    const seen = new Set()
    $("a[href$='.html']").each((_, el) => {
      const $a = $(el)
      const href = $a.attr("href") || ""
      if (!/^\/\d+\/\d+\/\d+\.html$/.test(href) || seen.has(href)) return
      const ctitle = $a.text().trim()
      if (!ctitle || ctitle === "从头阅读") return
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
    if (res.status < 200 || res.status >= 300) throw new Error("heifenxs: chapter HTTP " + res.status)
    const $ = this._cheerio().load(res.body || "")
    const $box = $("#articlecontent, #novelcontent").first()
    $box.find("script, style, ins").remove()
    const html = ($box.html() || "").trim()
    if (!html) throw new Error("heifenxs: empty chapter content")
    return { html }
  }
}
