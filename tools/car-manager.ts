import * as cheerio from 'cheerio'
import { CarRepository } from './car-repository.js'
import type { CarDetail, CarStatus, CarWithType } from './types.js'

export interface ScrapedCar {
  carName: string
  status: CarStatus
  data: CarDetail
}

export class CarManager {
  private url: string
  private html: string | null
  private repo: CarRepository
  public changes: CarWithType[]

  constructor() {
    this.url = 'https://cp.toyota.jp/rentacar'
    this.html = null
    this.repo = new CarRepository()
    this.changes = []
  }

  private async fetchCars(): Promise<ScrapedCar[] | null> {
    const response = await fetch(this.url)
    const html = await response.text()

    // 変化なし
    if (!process.env.NO_CACHE && this.html === html) return null
    this.html = html

    const $ = cheerio.load(html)
    const allCarElems = $('ul#service-items-shop-type-start').find('li > div.service-item__body')
    const cars: ScrapedCar[] = []

    allCarElems.each((_idx, element) => {
      const carName = $(element).find('div.service-item__info__car-type > p:not(.label-sp)').text().trim()
      const startShop = $(element)
        .find('div.service-item__shop-start > p:not(.label-sp)')
        .text()
        .trim()
        .replace(/(.+)（.+?）$/, (_m, p: string) => p)
        .trim()
      const startArea = $(element).parent().attr('data-start-area') ?? ''
      const returnShop = $(element)
        .find('div.service-item__shop-return > p:not(.label-sp)')
        .text()
        .replace(/（下記参照）| 返却可能店舗/g, '')
        .trim()
      const returnArea = $(element).parent().attr('data-return-area') ?? ''
      const condition = $(element).find('div.service-item__info__condition > p:not(.label-sp)').text().trim()
      const reservePhoneNumber = $(element).find('div.service-item__reserve-tel').text().trim()
      const date = $(element).find('div.service-item__date > p:not(.label-sp)').text().trim()
      const data: CarDetail = { startShop, returnShop, condition, date, startArea, returnArea, reservePhoneNumber }
      const status: CarStatus = $(element).hasClass('show-entry-end') ? 'unavailable' : 'available'
      cars.push({ carName, status, data })
    })

    return cars
  }

  private isEqual(a: CarDetail, b: CarDetail): boolean {
    return a.startShop === b.startShop
      && a.returnShop === b.returnShop
      && a.condition === b.condition
      && a.date === b.date
      && a.startArea === b.startArea
      && a.returnArea === b.returnArea
      && a.reservePhoneNumber === b.reservePhoneNumber
  }

  private async registerCars(scrapedCars: ScrapedCar[]) {
    this.changes = []
    const existing = await this.repo.getAll()
    const seen = new Set<string>()

    for (const { carName, status, data } of scrapedCars) {
      seen.add(carName)
      // 前の状態を確認
      const record = existing.get(carName)

      if (!record) {
        // DB未登録 → 新規追加
        await this.repo.put(carName, status, data)
        if (status === 'available') {
          this.changes.push({ carName, ...data, type: 'new' })
        }
      } else if (record.status === 'available' && status === 'unavailable') {
        // 受付中 → 受付終了（売切れ）
        await this.repo.updateStatus(carName, 'unavailable')
        this.changes.push({ carName, ...data, type: 'soldOut', ts: record.ts })
      } else if (record.status === 'unavailable' && status === 'available') {
        // 受付終了 → 受付中（復活）
        await this.repo.updateStatus(carName, 'available')
        this.changes.push({ carName, ...data, type: 'recovered', ts: record.ts })
      } else if (status === 'available' && !this.isEqual(record.data, data)) {
        // 受付中のままデータ変化（更新）
        await this.repo.updateData(carName, data)
        this.changes.push({ carName, ...data, type: 'updated', ts: record.ts })
      }
    }
  }

  public async initDB() {
    await this.repo.deleteAll()
    this.html = null
    const cars = await this.fetchCars()
    if (cars) {
      for (const { carName, status, data } of cars) {
        await this.repo.put(carName, status, data)
      }
    }
  }

  public async updateTs(carName: string, ts: string) {
    await this.repo.updateTs(carName, ts)
  }

  public async getCars() {
    const cars = await this.fetchCars()
    if (cars) await this.registerCars(cars)
  }
}
