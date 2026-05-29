const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.2",
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
    return img.getSrc ||
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      "";
  }

  episodeUrlToAnimeUrl(epUrl) {
    try {
      let path = epUrl.replace(/^https?:\/\/[^/]+/, "");
      let slug = path.replace(/^\/episode\//, "").replace(/\/$/, "");
      try { slug = decodeURIComponent(slug); } catch(e) {}
      slug = slug.replace(/^انمي-/, "").replace(/^فيلم-/, "");
      slug = slug.replace(/-[؀-ۿ].*$/, "");
      if (slug) return `${this.baseUrl}/anime/${slug}/`;
    } catch(e) {}
    return null;
  }

  parseAnimeCards(doc) {
    const list = [];
    const seen = new Set();
    const imgLinks = doc.select("a[href*='/anime/']");
    for (const a of imgLinks) {
      const link = a.attr("href") || "";
      if (!link.includes("/anime/") || seen.has(link)) continue;
      const img = a.selectFirst("img");
      if (!img) continue;
      seen.add(link);
      const imageUrl = this.getImageUrl(img);
      const headingLink = doc.selectFirst(`h2 a[href='${link}'], h3 a[href='${link}'], h1 a[href='${link}']`);
      const title = headingLink ? headingLink.text.trim() : (img.attr("alt") || "");
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
    const url = page === 1
      ? `${this.baseUrl}/home8/`
      : `${this.baseUrl}/episode/page/${page}/`;
    const doc = await this.request(url);
    const list = [];
    const seenAnimeUrls = new Set();

    if (page === 1) {
      const epLinks = doc.select("a[href*='/episode/']");
      for (const a of epLinks) {
        const img = a.selectFirst("img");
        if (!img) continue;
        const epUrl = a.attr("href") || "";
        if (!epUrl.includes("/episode/")) continue;
        const animeUrl = this.episodeUrlToAnimeUrl(epUrl);
        if (!animeUrl || seenAnimeUrls.has(animeUrl)) continue;
        seenAnimeUrls.add(animeUrl);
        const imageUrl = this.getImageUrl(img);
        const titleLink = doc.selectFirst(`a[href='${epUrl}'] h2, a[href='${epUrl}'] h3, a[href='${encodeURI(epUrl)}'] h2, a[href='${encodeURI(epUrl)}'] h3`);
        const title = titleLink ? titleLink.text.trim() : (img.attr("alt") || "");
        if (!title) continue;
        list.push({ name: title, imageUrl, link: animeUrl });
      }
    } else {
      const headings = doc.select("h2 a[href*='/anime/'], h3 a[href*='/anime/']");
      for (const headingLink of headings) {
        const animeUrl = headingLink.attr("href") || "";
        if (!animeUrl.includes("/anime/") || seenAnimeUrls.has(animeUrl)) continue;
        seenAnimeUrls.add(animeUrl);
        const title = headingLink.text.trim();
        if (!title) continue;
        const img = doc.selectFirst(`img[alt='${title}']`);
        const imageUrl = img ? this.getImageUrl(img) : "";
        list.push({ name: title, imageUrl, link: animeUrl });
      }
    }

    const hasNextPage = page === 1 ? true : !!doc.selectFirst("a.next, a[rel='next'], .page-numbers .next");
    return { list, hasNextPage };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&page=${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
    return { list, hasNextPage };
  }

  async getDetail(url) {
    const doc = await this.request(url);
    const title = doc.selectFirst("h1")?.text?.trim() || doc.selectFirst("h2")?.text?.trim() || "";
    let imageUrl = "";
    const imgSelectors = ["img.thumbnail", "div.anime-thumbnail img", ".anime-details img", ".anime-cover img", "img[alt]"];
    for (const sel of imgSelectors) {
      const img = doc.selectFirst(sel);
      if (img) {
        imageUrl = this.getImageUrl(img);
        if (imageUrl) break;
      }
    }
    const description = doc.selectFirst("p.anime-story, div.anime-story, .story, p.story")?.text?.trim() || "";
    const genreEls = doc.select(".anime-genres a, .genres a, div[class*='genre'] a");
    const genre = genreEls.map(el => el.text.trim()).filter(Boolean);
    const rawStatus = doc.selectFirst(".anime-info .status, span.status, .anime-status")?.text?.trim() || "";
    const status = this.parseStatus(rawStatus);
    const episodes = [];
    const seen = new Set();
    const epLinks = doc.select("#episodesList a[href], .episodes-list a[href], ul.episodes a[href]");
    for (const ep of epLinks) {
      const epLink = ep.attr("href") || "";
      if (!epLink || seen.has(epLink)) continue;
      seen.add(epLink);
      const epText = ep.text?.trim() || ep.selectFirst("h3, span")?.text?.trim() || "";
      const epNumMatch = epText.match(/(\d+(\.\d+)?)/);
      const num = epNumMatch ? parseFloat(epNumMatch[1]) : episodes.length + 1;
      episodes.push({ name: "الحلقة " + num, url: epLink, num, scanlator: "" });
    }
    return { name: title, imageUrl, description, genre, status, episodes };
  }

  parseStatus(text) {
    if (!text) return 0;
    const t = text.toLowerCase();
    if (t.includes("مكتمل") || t.includes("completed")) return 1;
    if (t.includes("يعرض") || t.includes("ongoing")) return 2;
    return 0;
  }

  async getVideoList(url) {
    const doc = await this.request(url);
    const videos = [];
    const serverLinks = doc.select("ul.list-server-items li, .server-list li, li.server-item, li[data-id]");
    for (const server of serverLinks) {
      const dataId = server.attr("data-id") || server.attr("data-embed") || "";
      const serverName = server.selectFirst("a, span")?.text?.trim() || server.text?.trim() || "Server";
      if (dataId) videos.push({ url: dataId, quality: serverName, originalUrl: dataId });
    }
    if (videos.length === 0) {
      const iframes = doc.select("iframe[src]");
      for (const iframe of iframes) {
        const src = iframe.attr("src") || "";
        if (src) videos.push({ url: src, quality: "Default", originalUrl: src });
      }
    }
    return this.sortVideos(videos);
  }

  sortVideos(videos) {
    const preferences = new SharedPreferences();
    const preferredQuality = preferences.get("preferred_quality") || "1080";
    videos.sort((a, b) => {
      const aMatch = a.quality.includes(preferredQuality) ? 1 : 0;
      const bMatch = b.quality.includes(preferredQuality) ? 1 : 0;
      return bMatch - aMatch;
    });
    return videos;
  }

  getFilterList() { return []; }

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
