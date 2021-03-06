import request from 'request-promise';
import * as xml2js from 'xml2js';
import adjustUrlBase from './adjust-url-base.js';

export default class SitemapCrawler {

  constructor(config, cache) {
    this._config = config;
    this._cache = cache;
    this.crawlSitemaps(); // run in background
  }

  async crawlSitemaps() {
    await new Promise((resolve, reject) => {
      setTimeout(() => resolve(), 1 * 60 * 1000);
    });
    const configs = await this._config.retrieveAll();
    for(let config of configs) {
      for(let sitemapUrl of config.sitemaps) {
        sitemapUrl = adjustUrlBase(sitemapUrl, config.appUrl);
        try {
          await this.crawlSitemap(config, sitemapUrl);
        }
        catch(error) {
          console.log(
            'could not retrieve sitemap', sitemapUrl,
            ' - error:', error.message || 'unknown error'
          );
        }
      }
    }
    console.log('*** ghostwriter.sitemapCrawler:', 'done crawling sitemaps');
    await new Promise((resolve, reject) => {
      setTimeout(() => resolve(), 30 * 60 * 1000);
    });
    this.crawlSitemaps(); // continue running in background
  }

  async crawlSitemap(config, sitemapUrl) {
    console.log('*** ghostwriter.sitemapCrawler:', 'crawling sitemap', sitemapUrl);
    // retrieve sitemap
    const sitemapResponse = await request({
      simple: true,
      method: 'GET',
      uri: sitemapUrl,
      resolveWithFullResponse: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1 Ghostwriter/1.0 (+https://github.com/coreprocess/ghostwriter)',
      },
    });
    console.log('content type:', sitemapResponse.headers['content-type']);
    // check if content type fits
    if(  !sitemapResponse.headers['content-type'].startsWith('application/xml')
      && !sitemapResponse.headers['content-type'].startsWith('text/xml')
    ) {
      throw new Error('invalid content type');
    }
    // parse xml
    const sitemap = await new Promise((resolve, reject) => {
      xml2js.parseString(sitemapResponse.body, (error, result) => {
        if(error) {
          reject(error);
        }
        else {
          resolve(result);
        }
      });
    });
    // check if it is intermediate sitemap or a final one
    if(  typeof sitemap['sitemapindex'] == 'object'
      && sitemap['sitemapindex']['sitemap'] instanceof Array
    ) {
      for(let entry of sitemap['sitemapindex']['sitemap']) {
        if(entry['loc'] instanceof Array) {
          const subSitemapUrl = adjustUrlBase(
            entry['loc'].join(''),
            config.appUrl
          );
          try {
            await this.crawlSitemap(
              config,
              subSitemapUrl
            );
          }
          catch(error) {
            console.log(
              'could not retrieve sitemap', subSitemapUrl,
              ' - error:', error.message || 'unknown error'
            );
          }
        }
      }
    }
    else
    if(  typeof sitemap['urlset'] == 'object'
      && sitemap['urlset']['url'] instanceof Array
    ) {
      for(let entry of sitemap['urlset']['url']) {
        if(entry['loc'] instanceof Array) {
          const pageUrl = adjustUrlBase(entry['loc'].join(''), config.appUrl);
          for(let target of config.targets) {
            try {
              console.log('*** ghostwriter.sitemapCrawler:', 'caching page', pageUrl, target);
              await this._cache.retrievePage(
                config,
                pageUrl,
                target,
                false,
                false
              );
            }
            catch(error) {
              console.log(
                'could not crawl page', pageUrl, target,
                ' - error:', error.message || 'unknown error'
              );
            }
          }
        }
      }
    }
    else {
      console.log('invalid sitemap:', JSON.stringify(sitemap));
    }
  }

};
