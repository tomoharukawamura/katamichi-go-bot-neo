import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarWithType } from "../../../tools/types.js";

vi.mock("tools/error-handler.js", () => ({
	handleError: vi.fn(),
}));

// Slack App はテスト環境で初期化不可のためモック
vi.mock("../../../tools/slack/slack-bot-app.js", () => ({
	app: { client: {} },
}));

vi.mock("../../../tools/slack/post-carmessage.js", () => ({
	postCarMessage: vi.fn(),
}));

const { processCars } = await import("../fargate.js");
const { CarManager } = await import("../../../tools/car-data/car-manager.js");
const { CarRepository } = await import(
	"../../../tools/aws-sdk/car-repository.js"
);

describe("processCars（統合テスト）", () => {
	let manager: InstanceType<typeof CarManager>;
	let repo: InstanceType<typeof CarRepository>;
	let notifiedCars: CarWithType[];
	let mockNotify: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		repo = new CarRepository();
		await repo.deleteAll();
		manager = new CarManager();
		notifiedCars = [];
		mockNotify = vi.fn(async (car: CarWithType) => {
			notifiedCars.push(car);
			return car.type === "new"
				? { carName: car.carName, ts: `ts-${Date.now()}` }
				: null;
		});
	});

	afterEach(async () => {
		await repo.deleteAll();
	});

	it("初回実行で Toyota サイトから車データを取得し、available な車を通知する", async () => {
		await processCars(manager, mockNotify);

		// サイトに available な車があれば通知される
		for (const car of notifiedCars) {
			expect(car.type).toBe("new");
			expect(car.carName).toBeTruthy();
			expect(car.startShop).toBeTruthy();
			expect(car.returnShop).toBeTruthy();
		}

		// changes と通知回数が一致
		expect(mockNotify).toHaveBeenCalledTimes(notifiedCars.length);
	}, 30000);

	it("2回連続実行で同じ HTML なら2回目は変化なし", async () => {
		await processCars(manager, mockNotify);
		const firstCount = notifiedCars.length;
		manager.changes = [];

		// 2回目: cachedHtml と同じなら skip される
		await processCars(manager, mockNotify);

		expect(manager.changes).toHaveLength(0);
		// notify は1回目分のみ
		expect(mockNotify).toHaveBeenCalledTimes(firstCount);
	}, 30000);

	it("saveRecords → loadRecords でレコードを DB 経由で復元できる", async () => {
		await processCars(manager, mockNotify);
		await manager.saveRecords();

		// DB にレコードが書き込まれていることを確認
		const records = await repo.getAll();
		expect(records.size).toBeGreaterThan(0);

		// 新しい manager で DB からロード
		const manager2 = new CarManager();
		await manager2.loadRecords();

		// 再度同じデータを取得しても new は検知されない（既知のため）
		const notified2: CarWithType[] = [];
		const mockNotify2 = vi.fn(async (car: CarWithType) => {
			notified2.push(car);
			return null;
		});

		// cachedHtml がないので fetchCars は実行される
		await processCars(manager2, mockNotify2);

		// 既に DB にあるレコードは new にならない
		const newCars = notified2.filter((c) => c.type === "new");
		// サイトのデータが変わっていなければ new は 0
		// ※ サイトが更新されている場合は new が出る可能性があるが、
		//    少なくとも全部 new にはならない
		expect(newCars.length).toBeLessThan(records.size);
	}, 30000);

	it("initDB でスクレイピング結果を DB に同期できる", async () => {
		await manager.initDB();

		const records = await repo.getAll();
		expect(records.size).toBeGreaterThan(0);

		for (const [name, record] of records) {
			expect(record.carName).toBe(name);
			expect(["available", "unavailable"]).toContain(record.status);
			expect(record.data.startShop).toBeTruthy();
		}
	}, 30000);
});
