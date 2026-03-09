import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

interface SearchParams {
  startArea?: string
  returnArea?: string
  date?: Date
  carNames: string[]
}

interface SearchResult {
  carName: string
  startShop: string
  returnShop: string
  condition: string
  date: string
  phone: string
  startArea: string
  returnArea: string
}

class CarSearch {
  url: string
  shopListUrlPrefix: string
  html: string | null
  resultElem: cheerio.Cheerio<AnyNode> | null
  result: SearchResult[]

  constructor() {
    this.url = 'https://cp.toyota.jp/rentacar'
    this.shopListUrlPrefix = 'https://cp.toyota.jp/rentacar/shoplist/'
    this.html = null
    this.resultElem = null
    this.result = []
  }

  async searchCars(params: SearchParams) {
    const html = await (await fetch(this.url)).text()
    const $ = cheerio.load(html)
    let resultElem = $('ul#service-items-shop-type-start')
      .find('li')
      .has('div.service-item__body:not(.show-entry-end)')
    const { startArea: startA, returnArea: returnA, date, carNames } = params
    if (startA) {
      resultElem = resultElem.filter(`[data-start-area=${startA}]`)
    }
    if (returnA) {
      resultElem = resultElem.filter(`[data-return-area=${returnA}]`)
    }
    if (carNames.length) {
      const createdCarSelector = carNames.map((car) => `:contains("${car}")`).join(', ')
      resultElem = resultElem.has(`div.service-item__info__car-type > p:not(.label-sp)${createdCarSelector}`)
    }

    const DATE_REGEX = /^.+(\d{1,2})月(\d{1,2})日/
    const year = new Date().getFullYear()
    resultElem.each((_idx, element) => {
      const carName = $(element).find('div.service-item__info__car-type > p:not(.label-sp)').text().trim()
      const startShop = $(element)
        .find('div.service-item__shop-start > p:not(.label-sp)')
        .text()
        .replace(/（.+）/, '')
        .trim()
      const startArea = $(element).attr('data-start-area') ?? ''
      const returnShop = $(element)
        .find('div.service-item__shop-return > p:not(.label-sp)')
        .text()
        .replace(/（下記参照）| 返却可能店舗/g, '')
        .trim()
      const returnArea = $(element).attr('data-return-area') ?? ''
      const condition = $(element).find('div.service-item__info__condition > p:not(.label-sp)').text().trim()
      const dateTxt = $(element).find('div.service-item__date > p:not(.label-sp)').text().trim()
      const [startDate, deadDate] = dateTxt.split('～').map((d) => {
        const match = d.match(DATE_REGEX)!
        const month = parseInt(match[1], 10)
        const day = parseInt(match[2], 10)
        return new Date(year, month - 1, day)
      })
      const phone = $(element).find('div.service-item__reserve-tel').text().trim()
      if (!date || (startDate <= date && date <= deadDate)) {
        this.result.push({ carName, startShop, returnShop, condition, date: dateTxt, phone, startArea, returnArea })
      }
    })
    console.log(this.result)
  }
}

const s = new CarSearch()
await s.searchCars({ startArea: '5', returnArea: '3', carNames: [], date: new Date(2025, 4, 6) })
