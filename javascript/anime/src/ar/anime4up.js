const mangayomiSources = [{
  "name": "Anime4Up",
  "lang": "ar",
  "baseUrl": "https://w1.anime4up.rest",
  "apiUrl": "",
  "iconUrl": "https://w1.anime4up.rest/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.9",
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

  // Popular page: <a href=/anime/>(img) then <h2><a href=/anime/>Title</a></h2>
  parseAnimeCards(doc) {
    const list = [];
    const seen = new Set();
    // Find all image links to /anime/
    const imgLinks = doc.select("a[href*='/anime/']");
    for (const a of imgLinks) {
      const link = a.attr("href") || "";
      if (!link.includes("/anime/") || seen.has(link)) continue;
      const img = a.selectFirst("img");
      if (!img) continue; // skip text-only heading links
      seen.add(link);
      const imageUrl = this.getImageUrl(img);
      // Find heading sibling with same link for title
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
    // Episode page structure:
    // image "Title" + link[href=/episode/] (image link)
    // heading "Title" > link[href=/anime/...] (anime link)
    const url = `${this.baseUrl}/episode/page/${page}/`;
    const doc = await this.request(url);
    const list = [];
    const seenAnimeUrls = new Set();

    // Strategy: find all headings on the episode page that link to /anime/
    // Each heading has: <h2><a href=/anime/slug/>Title</a></h2>
    // The image is the previous sibling's image
    const headings = doc.select("h2 a[href*='/anime/'], h3 a[href*='/anime/']");
    for (const headingLink of headings) {
      const animeUrl = headingLink.attr("href") || "";
      if (!animeUrl.includes("/anime/") || seenAnimeUrls.has(animeUrl)) continue;
      seenAnimeUrls.add(animeUrl);
      const title = headingLink.text.trim();
      if (!title) continue;
      // Find the image: it has the same alt text as the title
      // Select any img with matching alt
      const img = doc.selectFirst(`img[alt='${title.replace(/'/g, "\\'").replace(/"/g, '\\"')}']`);
      const imageUrl = img ? this.getImageUrl(img) : "";
      list.push({ name: title, imageUrl, link: animeUrl });
    }

    const hasNextPage = !!doc.selectFirst("a.next, a[rel='next'], .page-numbers .next");
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
