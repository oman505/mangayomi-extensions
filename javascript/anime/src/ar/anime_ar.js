const mangayomiSources = [{
  "name": "anime_ar",
  "lang": "ar",
  "baseUrl": "https://witanime.you",
  "apiUrl": "",
  "iconUrl": "https://witanime.you/wp-content/uploads/2022/01/WITLOGO.png",
  "typeSource": "single",
  "itemType": 1,
  "isMFn": false,
  "version": "0.0.4",
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

  parseAnchors(doc) {
    const anchors = doc.select("a");
    const list = [];
    for (const a of anchors) {
      const href = this.absoluteUrl(a.attr("href") || "");
      const text = a.text().trim();
      list.push({ href, text, el: a });
    }
    return list;
  }

  parseAnimeListPage(doc) {
    const list = [];
    const seen = new Set();
    const anchors = this.parseAnchors(doc);

    for (const item of anchors) {
      const href = item.href;
      const name = item.text;

      if (!href.includes("/anime/")) continue;
      if (href.includes("/anime-status/")) continue;
      if (href.includes("/anime-type/")) continue;
      if (href.includes("/anime-season/")) continue;
      if (href.includes("/anime-genre/")) continue;
      if (!name || name.length < 2) continue;
      if (seen.has(href)) continue;

      seen.add(href);
      list.push({
        name,
        imageUrl: "",
        link: this.normalizeLink(href)
      });
    }

    return list;
  }

  parseEpisodePairs(doc, headerTitle) {
    const lines = doc.select("h3, a");
    const list = [];
    const seen = new Set();
    let inSection = false;
    let pendingEpisode = null;

    for (const node of lines) {
      const text = node.text().trim();
      const href = node.tagName && node.tagName() === "a"
        ? this.absoluteUrl(node.attr("href") || "")
        : "";

      if (text === headerTitle) {
        inSection = true;
        pendingEpisode = null;
        continue;
      }

      if (!inSection) continue;

      if (text.startsWith("###")) continue;
      if (text === "المزيد من الحلقات") continue;
      if (
        text === "أكثر أنميات الموسم مشاهدة" ||
        text === "آخر الحلقات المضافة" ||
        text === "آخر الأنميات المضافة" ||
        text === "الأنميات المثبتة"
      ) {
        break;
      }

      if (href.includes("/episode/") && text.includes("الحلقة")) {
        pendingEpisode = {
          episodeName: text,
          episodeLink: href
        };
        continue;
      }

      if (pendingEpisode && href.includes("/anime/")) {
        if (!seen.has(pendingEpisode.episodeLink)) {
          seen.add(pendingEpisode.episodeLink);
          list.push({
            name: `${text} - ${pendingEpisode.episodeName}`,
            imageUrl: "",
            link: this.normalizeLink(pendingEpisode.episodeLink)
          });
        }
        pendingEpisode = null;
      }
    }

    return list;
  }

  async getPopular(page) {
    const url = page === 1
      ? `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/`
      : `${this.baseUrl}/%D9%82%D8%A7%D8%A6%D9%85%D8%A9-%D8%A7%D9%84%D8%A7%D9%86%D9%85%D9%8A/page/${page}/`;

    const doc = await this.request(url);
    const list = this.parseAnimeListPage(doc);

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
    let list = this.parseEpisodePairs(doc, "حلقات الأنمي المثبتة");

    if (list.length === 0) {
      const episodeDoc = await this.request(`${this.baseUrl}/episode/`);
      list = this.parseEpisodePairs(episodeDoc, "أرشيف حلقات الأنمي");
    }

    return {
      list,
      hasNextPage: false
    };
  }

  async search(query, page, filters) {
    const url = `${this.baseUrl}/?search_param=animes&s=${encodeURIComponent(query)}`;
    const doc = await this.request(url);
    const list = this.parseAnimeListPage(doc).filter(item =>
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
