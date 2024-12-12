export type Tif = "Alo" | "Ioc" | "Gtc";
export type TriggerType = "tp" | "sl";
export type LimitOrder = { tif: Tif };
export type TriggerOrder = {
  triggerPx: string | number;
  isMarket: boolean;
  tpsl: TriggerType;
};
export type Grouping = "na" | "normalTpsl" | "positionTpsl";
export type OrderType = { limit?: LimitOrder; trigger?: TriggerOrder };
export type Cloid = string;
export type OidOrCloid = number | Cloid;

export interface Order extends BaseOrder {
  orders?: undefined;
  coin: string;
  is_buy: boolean;
  sz: number;
  limit_px: number;
  order_type: OrderType;
  reduce_only: boolean;
  cloid?: Cloid;
}

export type OrderRequest = Order;

interface BaseOrder {
  vaultAddress?: string;
  grouping?: Grouping;
  builder?: Builder;
}

export interface Builder {
  address: string;
  fee: number;
}

export interface Meta {
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated: boolean;
  }[];
}

export interface OrderResponse {
  status: string;
  response: {
    type: string;
    data: {
      statuses: Array<{
        resting?: { oid: number };
        filled?: { oid: number };
      }>;
    };
  };
}

export interface WsMessage {
  channel: string;
  data: any;
}

export interface WsBook {
  coin: string;
  levels: [Array<WsLevel>, Array<WsLevel>];
  time: number;
}

export interface WsLevel {
  px: string;
  sz: string;
  n: number;
}

export interface WsFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
}

export interface OrderWire {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: OrderType;
  c?: string;
}

export interface Signature {
  r: string;
  s: string;
  v: number;
}

export interface WsUserFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
}

export type WsUserFills = {
  isSnapshot: boolean;
  fills: WsUserFill[];
  user: string;
};

export enum Side {
  BUY,
  SELL,
}
