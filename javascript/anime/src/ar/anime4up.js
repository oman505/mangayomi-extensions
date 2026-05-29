const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.7",
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

  // Convert episode URL slug to anime URL
  // e.g. /episode/انمي-slug-الحلقة-9-مترجمة/ => /anime/slug/
  episodeUrlToAnimeUrl(epUrl) {
    try {
      let path = epUrl.replace(/^https?:\/\/[^/]+/, "");
      // Remove /episode/ prefix and trailing slash
      let slug = path.replace(/^\/episode\//, "").replace(/\/$/, "");
      // URL-decode
      try { slug = decodeURIComponent(slug); } catch(e) {}
      // Strip Arabic prefix: انمي- or فيلم-
      slug = slug.replace(/^\u0627\u0646\u0645\u064a-/, "").replace(/^\u0641\u064a\u0644\u0645-/, "");
      // Strip Arabic episode suffix: -الحلقة-N-... or -الاونا-N-... or similar
      slug = slug.replace(/-[\u0600-\u06ff][\w\u0600-\u06ff\s]*$/, "");
      if (slug) return `${this.baseUrl}/anime/${slug}/`;
    } catch(e) {}
    return null;
  }

  // Parse anime cards from a page (for popular/search)
  parseAnimeCards(doc) {
    const list = [];
    // Try multiple possible card containers
    let cards = doc.select("div.anime-card-container");
    if (cards.length === 0) cards = doc.select("div.anime-card-poster");
    if (cards.length === 0) cards = doc.select("article.card");
    if (cards.length === 0) cards = doc.select("div[class*='col'] a[href*='/anime/']");

    if (cards.length > 0 && cards[0].tagName && cards[0].tagName.toLowerCase() === 'a') {
      // Direct links
      for (const a of cards) {
        const link = a.attr("href") || "";
        if (!link.includes("/anime/")) continue;
        const img = a.selectFirst("img");
        const imageUrl = img ? (img.getSrc || img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || "") : "";
        const title = (img ? img.attr("alt") : "") || a.text.trim() || "";
        if (title) list.push({ name: title, imageUrl, link });
      }
      return list;
    }

    for (const card of cards) {
      const a = card.selectFirst("a[href*='/anime/']") || card.selectFirst("a");
      if (!a) continue;
      const link = a.attr("href") || "";
      if (!link.includes("/anime/")) continue;
      const img = card.selectFirst("img");
      const imageUrl = img ? (img.getSrc || img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || "") : "";
      const title = (img ? img.attr("alt") : "") || a.text.trim() || card.selectFirst("h3, h2, h1")?.text?.trim() || "";
      if (title) list.push({ name: title, imageUrl, link });
    }
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/%d9%82%d8%a7%d8%a6%d9%85%d8%a9-%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a/page/${page}/`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
    return { list, hasNextPage };
  }

  async getLatestUpdates(page) {
    // /episode/ page shows episode cards with images
    const url = `${this.baseUrl}/episode/page/${page}/`;
    const doc = await this.request(url);
    const list = [];
    const seenAnimeUrls = new Set();

    // Episode page cards: each card is an <a> linking to /episode/ containing <img>
    // Try broad selector: any <a> with episode href containing an <img>
    const links = doc.select("a[href*='/episode/']");
    for (const a of links) {
      const epLink = a.attr("href") || "";
      if (!epLink || !epLink.includes("/episode/")) continue;
      const img = a.selectFirst("img");
      if (!img) continue; // skip text-only links
      const imageUrl = img.getSrc || img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || "";
      const title = img.attr("alt") || a.selectFirst("h2, h3, .anime-card-title, .title")?.text?.trim() || a.text.trim() || "";
      if (!title) continue;
      const animeUrl = this.episodeUrlToAnimeUrl(epLink);
      if (!animeUrl || seenAnimeUrls.has(animeUrl)) continue;
      seenAnimeUrls.add(animeUrl);
      list.push({ name: title, imageUrl, link: animeUrl });
    }

    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next']");
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
        imageUrl = img.getSrc || img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || "";
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
      episodes.push({ name: `\u0627\u0644\u062d\u0644\u0642\u0629 ${num}`, url: epLink, num, scanlator: "" });
    }

    return { name: title, imageUrl, description, genre, status, episodes };
  }

  parseStatus(text) {
    if (!text) return 0;
    const t = text.toLowerCase();
    if (t.includes("\u0645\u0643\u062a\u0645\u0644") || t.includes("completed")) return 1;
    if (t.includes("\u064a\u0639\u0631\u0636") || t.includes("ongoing")) return 2;
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
        title: "\u062c\u0648\u062f\u0629 \u0627\u0644\u0641\u064a\u062f\u064a\u0648 \u0627\u0644\u0645\u0641\u0636\u0644\u0629",
        summary: "",
        valueIndex: 0,
        entries: ["FHD 1080p", "HD 720p", "SD 480p"],
        entryValues: ["1080", "720", "480"]
      }
    }];
  }
}
