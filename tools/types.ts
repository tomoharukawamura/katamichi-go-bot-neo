export interface CarDetail {
  startShop: string;
  returnShop: string;
  condition: string;
  date: string;
  startArea: string;
  returnArea: string;
  reservePhoneNumber: string;
}

export type CarStatus = "available" | "unavailable";

export interface CarRecord {
  carName: string;
  status: CarStatus;
  data: CarDetail;
  ts?: string;
}

export type CarType = "new" | "updated" | "recovered" | "soldOut" | "search";

export interface CarWithType extends CarDetail {
  carName: string;
  type: CarType;
  ts?: string;
}

export interface ShopAreaEntry {
  icon?: string;
  name?: string;
  single?: boolean;
}
