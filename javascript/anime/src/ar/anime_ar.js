const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.0.2",
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

  parseAnimeCards(doc, options = {}) {
    const { allowEpisodes = false } = options;
    const list = [];
    const seen = new Set();

    const cards = doc.select(
      "div.anime-card-container, div.episodes-card-container, div.episode-card, .anime-card, article, div.col-lg-2, div.col-lg-3, div.col-md-3, div.col-sm-3"
    );

    for (const card of cards) {
      const anchor =
        card.selectFirst("a[title]") ||
        card.selectFirst("h3 a") ||
        card.selectFirst("a");

      if (!anchor) continue;

      const href = this.absoluteUrl(anchor.attr("href") || "");
      if (!href) continue;
      if (!allowEpisodes && href.includes("/episode/")) continue;
      if (seen.has(href)) continue;

      const img = card.selectFirst("img") || anchor.selectFirst("img");
      const title =
        anchor.attr("title") ||
        (img ? img.attr("alt") : "") ||
        this.textOf(card, ".anime-card-title") ||
        this.textOf(card, ".anime-title") ||
        this.textOf(card, "h3") ||
        anchor.text().trim();

      const imageUrl = img
        ? this.absoluteUrl(
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("data-original") ||
            img.attr("src") ||
            ""
          )
        : "";

      if (!title) continue;

      seen.add(href);
      list.push({
        name: title.trim(),
        imageUrl,
        link: this.normalizeLink(href)
      });
    }

    return list;
  }

  parsePinnedUpdates(doc) {
    const list = [];
    const seen = new Set();

    const sectionCandidates = doc.select("section, div, main");
    for (const section of sectionCandidates) {
      const sectionText = section.text();
      if (!sectionText || !sectionText.includes("حلقات الأنمي المثبتة")) continue;

      const cards = section.select(
        "a, article, div.anime-card-container, div.episodes-card-container, div.episode-card, li"
      );

      for (const card of cards) {
        const anchor =
          card.tagName && card.tagName() === "a"
            ? card
            : card.selectFirst("a");

        if (!anchor) continue;

        const href = this.absoluteUrl(anchor.attr("href") || "");
        if (!href || !href.includes("/episode/")) continue;
        if (seen.has(href)) continue;

        const img = card.selectFirst("img") || anchor.selectFirst("img");
        const title =
          anchor.attr("title") ||
          (img ? img.attr("alt") : "") ||
          this.textOf(card, "h3") ||
          this.textOf(card, ".episode-title") ||
          anchor.text().trim();

        const imageUrl = img
          ? this.absoluteUrl(
              img.attr("data-src") ||
              img.attr("data-lazy-src") ||
              img.attr("data-original") ||
              img.attr("src") ||
              ""
            )
          : "";

        if (!title) continue;

        seen.add(href);
        list.push({
          name: title.trim(),
          imageUrl,
          link: this.normalizeLink(href)
        });
      }

      if (list.length > 0) return list;
    }

    return list;
  }

  async getPopular(page) {
    const url = page === 1
      ? `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/`
      : `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/page/${page}/`;

    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc, { allowEpisodes: false });

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

    const doc = await this.request(this.baseUrl);
    let list = this.parsePinnedUpdates(doc);

    if (list.length === 0) {
      list = this
        .parseAnimeCards(doc, { allowEpisodes: true })
        .filter(item => item.link.includes("/episode/"));
    }

    return {
      list,
      hasNextPage: false
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
