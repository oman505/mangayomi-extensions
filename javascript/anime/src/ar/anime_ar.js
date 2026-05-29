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
  "pkgPath": "anime/src/ar/anime4up.js"
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
    return { "Referer": this.baseUrl };
  }

  parseAnimeCards(doc) {
    const list = [];
    const cards = doc.select("div.anime-card-container");
    // ... parsing logic
    return list;
  }

  async getPopular(page) {
    const url = `${this.baseUrl}/anime-type/tv2/page-${page}`;
    const doc = await this.request(url);
    const list = this.parseAnimeCards(doc);
    const nextPage = doc.selectFirst("a.next,page-numbers") !== null;
    return { list, hasNextPage: nextPage };
  }

  async getLatestUpdates(page) {
    // ... implementation
  }

  async search(query, page, filters) {
    // ... implementation
  }

  async getDetail(url) {
    // ... implementation
  }

  async getVideoList(url) {
    // ... implementation with extractDirectVideo helper
  }

  getFilterList() {
    return [];
  }
}
