const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.0.1",
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
    const full = this.absoluteUrl(url);
    return full.replace(this.baseUrl, "");
  }

  parseAnimeCards(doc, options = {}) {
    const { allowEpisodes = false } = options;
    const list = [];
    const seen = new Set();

    const selectors = [
      "div.anime-card-container",
      "div.col-lg-2",
      "div.col-md-3",
      "div.col-sm-3",
      "article",
      ".anime-card",
      ".episodes-card-container",
      ".episode-card"
    ];

    let cards = [];
    for (const selector of selectors) {
      const found = doc.select(selector);
      if (found && found.length > 0) {
        cards = found;
        break;
      }
    }

    for (const card of cards) {
      const anchor =
        card.selectFirst("a") ||
        card.selectFirst("h3 a") ||
        card.selectFirst(".anime-title a");

      if (!anchor) continue;

      const rawHref = anchor.attr("href") || "";
      if (!rawHref) continue;

      const href = this.absoluteUrl(rawHref);
      if (!allowEpisodes && href.includes("/episode/")) continue;
      if (seen.has(href)) continue;

      const img =
        card.selectFirst("img") ||
        anchor.selectFirst("img");

      const title =
        anchor.attr("title") ||
        (img ? img.attr("alt") : "") ||
        (card.selectFirst(".anime-card-title") ? card.selectFirst(".anime-card-title").text() : "") ||
        (card.selectFirst(".anime-title") ? card.selectFirst(".anime-title").text() : "") ||
        (card.selectFirst("h3") ? card.selectFirst("h3").text() : "") ||
        anchor.text() ||
        card.text();

      const imageUrl = img
        ? (
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("src") ||
            ""
          )
        : "";

      if (!title || title.trim() === "") continue;

      seen.add(href);
      list.push({
        name: title.trim(),
        imageUrl: this.absoluteUrl(imageUrl.trim()),
        link: this.normalizeLink(href)
      });
    }

    return list;
  }

  async getPopular(page) {
    const url = page === 1
      ? `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/`
      : `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/page/${page}/`;

    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc, { allowEpisodes: false });

    const hasNextPage =
      doc.selectFirst(`a[href*="/page/${page + 1}/"]`) != null ||
      list.length > 0;

    return {
      list,
      hasNextPage
    };
  }

  async getLatest(page) {
    const url = page === 1
      ? `${this.baseUrl}/episode/`
      : `${this.baseUrl}/episode/page/${page}/`;

    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc, { allowEpisodes: true });

    const hasNextPage =
      doc.selectFirst(`a[href*="/episode/page/${page + 1}/"]`) != null ||
      list.length > 0;

    return {
      list,
      hasNextPage
    };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?search_param=animes&s=${encodeURIComponent(query)}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc, { allowEpisodes: false });

    return {
      list,
      hasNextPage: false
    };
  }

  async getDetail(url) {
    const doc = await this.request(this.absoluteUrl(url));

    const title =
      doc.selectFirst("h1")?.text() ||
      doc.selectFirst("title")?.text() ||
      "";

    const image =
      doc.selectFirst("img")?.attr("src") ||
      doc.selectFirst("img")?.attr("data-src") ||
      "";

    const description =
      doc.selectFirst(".anime-story")?.text() ||
      doc.selectFirst(".story")?.text() ||
      doc.selectFirst(".description")?.text() ||
      "";

    return {
      name: title.trim(),
      imageUrl: this.absoluteUrl(image),
      description: description.trim(),
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
