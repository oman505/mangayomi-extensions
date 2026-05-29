const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.0.5",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/ar/anime_ar.js"
}];

class DefaultExtension extends MProvider {
  get baseUrl() {
    return this.source.baseUrl;
  }

  async request(url) {
    const res = await new Client().get(url, this.headers());
    return new Document(res.body);
  }

  headers() {
    return {
      "Referer": this.baseUrl,
      "Origin": this.baseUrl,
      "User-Agent": "Mozilla/5.0"
    };
  }

  absoluteUrl(url) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${this.baseUrl}${url}`;
    return `${this.baseUrl}/${url}`;
  }

  normalizeLink(url) {
    return this.absoluteUrl(url).replace(this.baseUrl, "");
  }

  textOf(el, selector) {
    const node = el.selectFirst(selector);
    return node ? node.text().trim() : "";
  }

  attrOf(el, selector, attr) {
    const node = el.selectFirst(selector);
    return node ? (node.attr(attr) || "").trim() : "";
  }

  cleanName(name) {
    return (name || "")
      .replace(/\s+/g, " ")
      .replace(/^#+\s*/, "")
      .trim();
  }

  parseAllAnchors(doc) {
    const anchors = doc.select("a");
    const results = [];

    for (const a of anchors) {
      const href = this.absoluteUrl(a.attr("href") || "");
      const text = this.cleanName(a.text());
      const title = this.cleanName(a.attr("title") || "");
      const img = a.selectFirst("img");

      const imageUrl = img
        ? this.absoluteUrl(
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("src") ||
            ""
          )
        : "";

      results.push({
        href,
        text,
        title,
        imageUrl,
        className: a.attr("class") || ""
      });
    }

    return results;
  }

  parsePopularFromAnimePage(doc) {
    const list = [];
    const seen = new Set();
    const anchors = this.parseAllAnchors(doc);

    for (const item of anchors) {
      const href = item.href;
      const name = item.title || item.text;

      if (!href) continue;
      if (!href.includes("/anime/")) continue;
      if (href.includes("/anime-status/")) continue;
      if (href.includes("/anime-type/")) continue;
      if (href.includes("/anime-season/")) continue;
      if (href.includes("/anime-genre/")) continue;
      if (href.includes("/episode/")) continue;
      if (!name || name.length < 2) continue;
      if (seen.has(href)) continue;

      seen.add(href);
      list.push({
        name,
        imageUrl: item.imageUrl,
        link: this.normalizeLink(href)
      });
    }

    return list;
  }

  parseLatestFromHome(doc) {
    const list = [];
    const seen = new Set();
    const anchors = this.parseAllAnchors(doc);

    for (const item of anchors) {
      if (!item.href) continue;
      if (!item.href.includes("/episode/")) continue;
      if (item.className.includes("see-all")) continue;

      const name = item.title || item.text;
      if (!name || name.length < 2) continue;
      if (seen.has(item.href)) continue;

      seen.add(item.href);
      list.push({
        name,
        imageUrl: item.imageUrl,
        link: this.normalizeLink(item.href)
      });
    }

    return list;
  }

  parseLatestFromEpisodePage(doc) {
    const list = [];
    const seen = new Set();
    const anchors = this.parseAllAnchors(doc);

    for (const item of anchors) {
      if (!item.href) continue;
      if (!item.href.includes("/episode/")) continue;

      const name = item.title || item.text;
      if (!name || name.length < 2) continue;
      if (seen.has(item.href)) continue;

      seen.add(item.href);
      list.push({
        name,
        imageUrl: item.imageUrl,
        link: this.normalizeLink(item.href)
      });
    }

    return list;
  }

  async getPopular(page) {
    const url = page === 1
      ? `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/`
      : `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/page/${page}/`;

    const doc = await this.request(url);
    const list = this.parsePopularFromAnimePage(doc);

    return {
      list,
      hasNextPage: doc.selectFirst(`a[href*="/page/${page + 1}/"]`) != null
    };
  }

  async getLatestUpdates(page) {
    if (page !== 1) {
      return {
        list: [],
        hasNextPage: false
      };
    }

    const homeDoc = await this.request(this.baseUrl);
    let list = this.parseLatestFromHome(homeDoc);

    if (list.length === 0) {
      const episodeDoc = await this.request(`${this.baseUrl}/episode/`);
      list = this.parseLatestFromEpisodePage(episodeDoc);
    }

    return {
      list,
      hasNextPage: false
    };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?search_param=animes&s=${encodeURIComponent(query)}`;
    const doc = await this.request(url);
    const list = this.parsePopularFromAnimePage(doc).filter(item =>
      item.name.toLowerCase().includes(query.toLowerCase())
    );

    return {
      list,
      hasNextPage: false
    };
  }

  async getDetail(url) {
    const doc = await this.request(this.absoluteUrl(url));

    const title =
      this.textOf(doc, "h1") ||
      this.textOf(doc, ".anime-details-title") ||
      this.textOf(doc, "title");

    const image =
      this.attrOf(doc, ".anime-thumb img", "src") ||
      this.attrOf(doc, ".anime-thumb img", "data-src") ||
      this.attrOf(doc, "img", "src");

    const description =
      this.textOf(doc, ".anime-story") ||
      this.textOf(doc, ".story") ||
      this.textOf(doc, ".description");

    return {
      name: title,
      imageUrl: this.absoluteUrl(image),
      description,
      link: url
    };
  }

  async getVideoList(url) {
    return [];
  }

  getFilterList() {
    return [];
  }
}
