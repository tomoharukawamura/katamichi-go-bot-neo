import * as cheerio from "cheerio";
import { CarRepository } from "../aws-sdk/car-repository.js";
import type { CarDetail, CarRecord, CarStatus, CarWithType } from "../types.js";
import { ScrapingError } from "tools/error.js";
import { handleError } from "tools/error-handler.js";

export interface ScrapedCar {
  carName: string;
  status: CarStatus;
  data: CarDetail;
}

export interface CarScrapingConfig {
  skipCache?: boolean;
}

export class CarManager {
  private url: string;
  private repo: CarRepository;
  private cachedHtml: string | null;
  private records: Map<string, CarRecord>;
  public changes: CarWithType[];

  constructor() {
    this.url = "https://cp.toyota.jp/rentacar";
    this.repo = new CarRepository();
    this.cachedHtml = null;
    this.records = new Map();
    this.changes = [];
  }

  public async loadRecords() {
    this.records = await this.repo.getAll();
  }

  private async fetchCars(
    config: CarScrapingConfig = {
      skipCache: false,
    },
  ): Promise<ScrapedCar[] | null> {
    let html: string;

    try {
      const response = await fetch(this.url);
      html = await response.text();
    } catch (e) {
      const error = new ScrapingError(
        "Failed to fetch car data",
        "FetchError",
        e instanceof Error ? e : String(e),
      );
      await handleError(error);
      return null;
    }

    if (!config.skipCache && this.cachedHtml === html) return null;
    this.cachedHtml = html;

    const $ = cheerio.load(html);
    const allCarElems = $("ul#service-items-shop-type-start").find(
      "li > div.service-item__body",
    );
    const cars: ScrapedCar[] = [];

    allCarElems.each((_idx, element) => {
      const carName = $(element)
        .find("div.service-item__info__car-type > p:not(.label-sp)")
        .text()
        .trim();
      const startShop = $(element)
        .find("div.service-item__shop-start > p:not(.label-sp)")
        .text()
        .trim()
        .replace(/(.+)（.+?）$/, (_m, p: string) => p)
        .trim();
      const startArea = $(element).parent().attr("data-start-area") ?? "";
      const returnShop = $(element)
        .find("div.service-item__shop-return > p:not(.label-sp)")
        .text()
        .replace(/（下記参照）| 返却可能店舗/g, "")
        .trim();
      const returnArea = $(element).parent().attr("data-return-area") ?? "";
      const condition = $(element)
        .find("div.service-item__info__condition > p:not(.label-sp)")
        .text()
        .trim();
      const reservePhoneNumber = $(element)
        .find("div.service-item__reserve-tel")
        .text()
        .trim();
      const date = $(element)
        .find("div.service-item__date > p:not(.label-sp)")
        .text()
        .trim();
      const data: CarDetail = {
        startShop,
        returnShop,
        condition,
        date,
        startArea,
        returnArea,
        reservePhoneNumber,
      };
      const status: CarStatus = $(element).hasClass("show-entry-end")
        ? "unavailable"
        : "available";
      cars.push({ carName, status, data });
    });

    return cars;
  }

  private isEqual(a: CarDetail, b: CarDetail): boolean {
    return (
      a.startShop === b.startShop &&
      a.returnShop === b.returnShop &&
      a.condition === b.condition &&
      a.date === b.date &&
      a.startArea === b.startArea &&
      a.returnArea === b.returnArea &&
      a.reservePhoneNumber === b.reservePhoneNumber
    );
  }

  private registerCars(scrapedCars: ScrapedCar[]) {
    this.changes = [];

    for (const { carName, status, data } of scrapedCars) {
      const record = this.records.get(carName);

      if (!record) {
        // 未登録 → 新規追加
        this.records.set(carName, { carName, status, data });
        if (status === "available") {
          this.changes.push({ carName, ...data, type: "new" });
        }
      } else if (record.status === "available" && status === "unavailable") {
        // 受付中 → 受付終了（売切れ）
        record.status = "unavailable";
        this.changes.push({ carName, ...data, type: "soldOut", ts: record.ts });
      } else if (record.status === "unavailable" && status === "available") {
        // 受付終了 → 受付中（復活）
        record.status = "available";
        this.changes.push({
          carName,
          ...data,
          type: "recovered",
          ts: record.ts,
        });
      } else if (status === "available" && !this.isEqual(record.data, data)) {
        // 受付中のままデータ変化（更新）
        record.data = data;
        this.changes.push({
          carName,
          ...data,
          type: "updated",
          ts: record.ts,
        });
      }
    }
  }

  private async syncToDb(records: Map<string, CarRecord>) {
    const existing = await this.repo.getAll();
    const newNames = new Set(records.keys());

    // DBにあって新しいレコードにないデータを削除
    await Promise.all(
      Array.from(existing.keys())
        .filter((name) => !newNames.has(name))
        .map((name) => this.repo.delete(name)),
    );

    // 追加・更新
    await Promise.all(
      Array.from(records.values()).map(({ carName, status, data, ts }) => {
        const record = existing.get(carName);
        if (!record) {
          const ops: Promise<void>[] = [this.repo.put(carName, status, data)];
          if (ts) ops.push(this.repo.updateTs(carName, ts));
          return Promise.all(ops);
        }
        const ops: Promise<void>[] = [];
        if (record.status !== status)
          ops.push(this.repo.updateStatus(carName, status));
        if (!this.isEqual(record.data, data))
          ops.push(this.repo.updateData(carName, data));
        if (ts && record.ts !== ts)
          ops.push(this.repo.updateTs(carName, ts));
        return Promise.all(ops);
      }),
    );
  }

  public async initDB() {
    const cars = await this.fetchCars({ skipCache: true });
    if (!cars) return;

    const records = new Map<string, CarRecord>();
    for (const { carName, status, data } of cars) {
      records.set(carName, { carName, status, data });
    }
    await this.syncToDb(records);
  }

  public updateTs(carName: string, ts: string) {
    const record = this.records.get(carName);
    if (record) record.ts = ts;
  }

  public async saveRecords() {
    await this.syncToDb(this.records);
  }

  public async getCars() {
    const cars = await this.fetchCars();
    if (cars) this.registerCars(cars);
  }
}
