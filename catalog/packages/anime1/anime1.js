/*
 * VeneraCat video-js plugin for anime1.me.
 *
 * Follows docs/VIDEO-PLUGIN-DESIGN.md. Playback cookies (e/p/h) returned by
 * https://v.anime1.me/api are extracted per episode and attached only to that
 * episode's PlayInfo.headers, keeping headers and cookies isolated per item.
 */
class Anime1 extends VideoSource {
  name = "Anime1.me"
  key = "anime1"
  version = "1.0.0"
  minCoreVersion = "1.0.0"
  url = "https://anime1.me"
  author = { name: "VeneraCat", url: "https://github.com/laincat/VeneraCat-Sources" }
  homepage = "https://anime1.me"

  _decodeHtml(text) {
    if (!text) return ""
    return String(text)
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .trim()
  }

  _extractPlayCookies(rawSetCookie) {
    if (!rawSetCookie) return ""
    const skip = new Set(["expires", "max-age", "path", "domain", "samesite", "secure", "httponly", "priority", "partitioned"])
    const pairs = []
    const seen = new Set()
    const re = /(?:^|,\s*)([A-Za-z0-9_.-]+)=([^;,\r\n]+)/g
    let m
    while ((m = re.exec(String(rawSetCookie))) !== null) {
      const name = m[1]
      const val = m[2].trim()
      if (skip.has(name.toLowerCase()) || seen.has(name)) continue
      seen.add(name)
      pairs.push(name + "=" + val)
    }
    return pairs.join("; ")
  }

  search = {
    load: async (keyword, options, page) => {
      const p = Number(page) > 1 ? Number(page) : 1
      const target =
        p > 1
          ? this.url + "/page/" + p + "/?s=" + encodeURIComponent(keyword)
          : this.url + "/?s=" + encodeURIComponent(keyword)
      const res = await Network.get(target)
      if (res.status < 200 || res.status >= 300) {
        throw new Error("anime1: search HTTP " + res.status)
      }
      const html = res.body || ""
      const videos = []
      const seen = new Set()

      const catRe = /href="(https:\/\/anime1\.me\/category\/[^"]+)"[^>]*>([^<]+)<\/a>/g
      let m
      while ((m = catRe.exec(html)) !== null) {
        const id = m[1]
        const title = this._decodeHtml(m[2])
        if (!id || !title || seen.has(id)) continue
        seen.add(id)
        videos.push(new Video({ id, title }))
      }

      if (videos.length === 0) {
        const entryRe = /<h2[^>]*class="entry-title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g
        while ((m = entryRe.exec(html)) !== null) {
          const id = m[1]
          const title = this._decodeHtml(m[2])
          if (!id || !title || seen.has(id)) continue
          seen.add(id)
          videos.push(new Video({ id, title }))
        }
      }

      const hasNext = /class="nav-previous"/.test(html)
      return { videos, maxPage: hasNext ? p + 1 : p }
    }
  }

  video = {
    loadInfo: async (id) => {
      const pageUrl = /^https?:\/\//i.test(id) ? id : this.url + "/" + String(id).replace(/^\/+/, "")
      const res = await Network.get(pageUrl)
      if (res.status < 200 || res.status >= 300) {
        throw new Error("anime1: details HTTP " + res.status)
      }
      const html = res.body || ""
      const pageTitleMatch = html.match(/<h1[^>]*class="page-title"[^>]*>([\s\S]*?)<\/h1>/)
      const pageTitle = pageTitleMatch ? this._decodeHtml(pageTitleMatch[1].replace(/<[^>]+>/g, "")) : "Anime1"

      const episodes = []
      const articleRe = /<article[\s\S]*?<\/article>/g
      let am
      while ((am = articleRe.exec(html)) !== null) {
        const block = am[0]
        const titleMatch = block.match(/<h2[^>]*class="entry-title"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)
        const reqMatch = block.match(/data-apireq="([^"]+)"/)
        if (!reqMatch) continue
        const epTitle = titleMatch ? this._decodeHtml(titleMatch[1]) : "Episode " + (episodes.length + 1)
        episodes.push({ id: reqMatch[1], title: epTitle })
      }

      return new VideoDetails({
        title: pageTitle,
        lines: [{ id: "anime1", name: "Anime1", episodes }]
      })
    },

    loadPlay: async (id, lineId, episodeId) => {
      let decoded = String(episodeId || "")
      try {
        decoded = decodeURIComponent(decoded)
      } catch (_) {}
      const res = await Network.post(
        "https://v.anime1.me/api",
        {
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": "https://anime1.me",
          "Referer": "https://anime1.me/"
        },
        "d=" + encodeURIComponent(decoded)
      )
      if (res.status < 200 || res.status >= 300) {
        throw new Error("anime1: play API HTTP " + res.status)
      }
      const data = JSON.parse(res.body || "{}")
      const sources = Array.isArray(data.s) ? data.s : []
      if (sources.length === 0 || !sources[0].src) {
        throw new Error("anime1: play API returned no stream")
      }
      let streamUrl = String(sources[0].src)
      if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl
      const mime = String(sources[0].type || "")
      const format = mime.includes("mpegurl") || streamUrl.includes(".m3u8") ? "hls" : "mp4"

      const headers = {
        "Referer": "https://anime1.me/",
        "Origin": "https://anime1.me"
      }
      const rawCookie = (res.headers && (res.headers["set-cookie"] || res.headers["Set-Cookie"])) || ""
      const cookieHeader = this._extractPlayCookies(rawCookie)
      if (cookieHeader) {
        headers["Cookie"] = cookieHeader
      }

      return new PlayInfo({
        url: streamUrl,
        format,
        headers
      })
    }
  }
}
