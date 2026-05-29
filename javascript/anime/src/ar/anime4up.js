const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "javascript/anime/src/ar/anime4up.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  get headers() {
    return { "Referer": this.baseUrl };
  }

  async request(url) {
    const res = await new Client().get(url, this.headers);
    return new Document(res.body);
  }

  getImageUrl(img) {
    if (!img) return "";
    return img.getSrc || img.attr("data-src") || img.attr("data-lazy-src") || img.attr("data-original") || img.attr("src") || "";
  }

  episodeUrlToAnimeUrl(epUrl) {
    try {
      let path = epUrl.replace(/^https?:\/\/[^/]+/, "");
      let slug = path.replace(/^\/episode\//, "").replace(/\/$/, "");
      try {
        slug = decodeURIComponent(slug);
      } catch(e) {}
      slug = slug.replace(/^انمي-/, "").replace(/^فيلم-/, "");
      slug = slug.replace(/-[؀-ۿ].*$/, "");
      if (slug) return `${this.baseUrl}/anime/${slug}/`;
    } catch(e) {}
    return null;
  }

  parseAnimeCards(doc) {
    const list = [];
    const seen = new Set();
    for (const a of doc.select("a[href*='/anime/']")) {
      const link = a.attr("href") || "";
      if (!link.includes("/anime/") || seen.has(link)) continue;
      const img = a.selectFirst("img");
      if (!img) continue;
      seen.add(link);
      const imageUrl = this.getImageUrl(img);
      const hl = doc.selectFirst(`h2 a[href='${link}'], h3 a[href='${link}'], h1 a[href='${link}']`);
      const title = hl ? hl.text.trim() : (img.attr("alt") || "");
      if (title) list.push({ name: title, imageUrl, link });
    }
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/page/${page}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next'], .page-numbers .next");
    return { list, hasNextPage };
  }

  async getLatestUpdates(page) {
    const url = page === 1 ? `${this.baseUrl}/home8/` : `${this.baseUrl}/episode/page/${page}/`;
    const doc = await this.request(url);
    const list = [];
    const seen = new Set();
    if (page === 1) {
      for (const a of doc.select("a[href*='/episode/']")) {
        const img = a.selectFirst("img");
        if (!img) continue;
        const epUrl = a.attr("href") || "";
        if (!epUrl.includes("/episode/")) continue;
        const animeUrl = this.episodeUrlToAnimeUrl(epUrl);
        if (!animeUrl || seen.has(animeUrl)) continue;
        seen.add(animeUrl);
        const imageUrl = this.getImageUrl(img);
        const tl = doc.selectFirst(`a[href='${epUrl}'] h2, a[href='${epUrl}'] h3, a[href='${encodeURI(epUrl)}'] h2, a[href='${encodeURI(epUrl)}'] h3`);
        const title = tl ? tl.text.trim() : (img.attr("alt") || "");
        if (!title) continue;
        list.push({ name: title, imageUrl, link: animeUrl });
      }
    } else {
      for (const hl of doc.select("h2 a[href*='/anime/'], h3 a[href*='/anime/']")) {
        const animeUrl = hl.attr("href") || "";
        if (!animeUrl.includes("/anime/") || seen.has(animeUrl)) continue;
        seen.add(animeUrl);
        const title = hl.text.trim();
        if (!title) continue;
        const img = doc.selectFirst(`img[alt='${title}']`);
        list.push({ name: title, imageUrl: img ? this.getImageUrl(img) : "", link: animeUrl });
      }
    }
    const hasNextPage = page === 1 ? true : !!doc.selectFirst("a.next, a[rel='next'], .page-numbers .next");
    return { list, hasNextPage };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    return { list: this.parseAnimeCards(doc), hasNextPage: !!doc.selectFirst("a.next, a[rel='next']") };
  }

  async getDetail(url) {
    const doc = await this.request(url);
    const title = doc.selectFirst("h1")?.text?.trim() || "";
    let imageUrl = "";
    for (const sel of ["img.thumbnail", ".anime-details img", ".anime-cover img", "img[alt]", "img"]) {
      const img = doc.selectFirst(sel);
      if (img) {
        imageUrl = this.getImageUrl(img);
        if (imageUrl) break;
      }
    }
    const description = doc.selectFirst("p.anime-story, div.anime-story, .story")?.text?.trim() || "";
    const genre = doc.select(".anime-genres a, .genres a").map(e => e.text.trim()).filter(Boolean);
    const rawStatus = doc.selectFirst(".anime-info .status, span.status")?.text?.trim() || "";
    const status = this.parseStatus(rawStatus);
    const episodes = [];
    const seen = new Set();
    for (const ep of doc.select("#episodesList a[href], .episodes-list a[href], ul.episodes a[href]")) {
      const epLink = ep.attr("href") || "";
      if (!epLink || seen.has(epLink)) continue;
      seen.add(epLink);
      const epText = ep.text?.trim() || "";
      const m = epText.match(/(\d+(\.\d+)?)/);
      const num = m ? parseFloat(m[1]) : episodes.length + 1;
      episodes.push({ name: "الحلقة " + num, url: epLink, num, scanlator: "" });
    }
    return { name: title, imageUrl, description, genre, status, episodes };
  }

  parseStatus(t) {
    if (!t) return 0;
    const s = t.toLowerCase();
    if (s.includes("مكتمل") || s.includes("completed")) return 1;
    if (s.includes("يعرض") || s.includes("ongoing")) return 2;
    return 0;
  }

  async extractVideoFromEmbed(embedUrl, host) {
    try {
      const res = await new Client().get(embedUrl, { "Referer": this.baseUrl });
      const html = res.body;

      if (host.includes("mp4upload")) {
        const match = html.match(/\|(\d+)\|(\d+)\|(\d+)\|video\|(\w+)\|mpvid\|/);
        if (match) {
          const vidId = match[4];
          const port = match[1];
          return `https://www.mp4upload.com:${port}/d/${vidId}/video.mp4`;
        }
        const urlMatch = html.match(/https?:\/\/[^"'\s]+\.mp4/);
        if (urlMatch) return urlMatch[0];
      }

      if (host.includes("voe.sx") || host.includes("voe")) {
        const match = html.match(/'hls':\s*'([^']+)'/);
        if (match) return match[1];
      }

      const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
      if (m3u8Match) return m3u8Match[0];

      const mp4Match = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
      if (mp4Match) return mp4Match[0];

    } catch(e) {}
    return null;
  }

  downloadToEmbed(rawUrl) {
    try {
      const u = rawUrl.trim();
      const host = u.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
      
      if (host.includes("megamax")) {
        const id = u.split("/d/")[1] || u.split("/download/")[1] || "";
        if (id) return `https://megamax.me/iframe/${id.replace(/\/$/, "")}`;
      }
      
      if (host.includes("streamruby")) {
        const id = u.split("/d/")[1] || "";
        if (id) return `https://streamruby.com/embed-${id.replace(/\/$/, "")}.html`;
      }
      
      if (host.includes("mp4upload")) {
        const parts = u.replace(/\/$/, "").split("/");
        const id = parts[parts.length - 1];
        if (id) return `https://www.mp4upload.com/embed-${id}.html`;
      }
      
      if (host.includes("dsvplay") || host.includes("dood")) {
        const id = u.split("/d/")[1] || "";
        if (id) return `https://dsvplay.com/e/${id.replace(/\/$/, "")}`;
      }
      
      if (host.includes("voe.sx") || host.includes("voe")) {
        const parts = u.replace(/\/$/, "").split("/");
        const id = parts[parts.length - 1];
        if (id) return `https://voe.sx/e/${id}`;
      }
      
      if (host.includes("uqload")) {
        const parts = u.replace(/\/$/, "").split("/");
        const id = parts[parts.length - 1];
        if (id) return `https://uqload.co/embed-${id}.html`;
      }
      
      if (host.includes("videa")) {
        return u;
      }
    } catch(e) {}
    return null;
  }

  async getVideoList(url) {
    const doc = await this.request(url);
    const videos = [];
    const rows = doc.select("#download tr, #download .table tr");
    
    for (const row of rows) {
      const linkEl = row.selectFirst("a[href]");
      if (!linkEl) continue;
      const rawUrl = linkEl.attr("href") || "";
      if (!rawUrl) continue;
      
      const cells = row.select("td");
      const serverName = cells.length > 1 ? (cells[1].text?.trim() || "Server") : "Server";
      const quality = cells.length > 2 ? (cells[2].text?.trim() || "") : "";
      const label = quality ? `${serverName} [${quality}]` : serverName;
      
      const embedUrl = this.downloadToEmbed(rawUrl);
      if (embedUrl) {
        const host = embedUrl.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
        const directUrl = await this.extractVideoFromEmbed(embedUrl, host);
        
        if (directUrl) {
          videos.push({ url: directUrl, quality: label, originalUrl: rawUrl });
        } else {
          videos.push({ url: embedUrl, quality: label, originalUrl: rawUrl });
        }
      }
    }
    
    return this.sortVideos(videos);
  }

  sortVideos(videos) {
    const pref = new SharedPreferences().get("preferred_quality") || "1080";
    return videos.sort((a, b) => {
      const am = a.quality.includes(pref) ? 1 : 0;
      const bm = b.quality.includes(pref) ? 1 : 0;
      return bm - am;
    });
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      key: "preferred_quality",
      listPreference: {
        title: "جودة الفيديو المفضلة",
        summary: "",
        valueIndex: 0,
        entries: ["FHD 1080p", "HD 720p", "SD 480p"],
        entryValues: ["1080", "720", "480"]
      }
    }];
  }
}
