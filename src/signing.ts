import { encode } from "@msgpack/msgpack";
import { ethers, getBytes, HDNodeWallet, keccak256, type Wallet } from "ethers";

import type {
  Builder,
  Order,
  OrderType,
  OrderWire,
  Signature,
  Grouping,
} from "./types";

const phantomDomain = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};

const agentTypes = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

export function orderTypeToWire(orderType: OrderType): OrderType {
  if (orderType.limit) {
    return { limit: orderType.limit };
  } else if (orderType.trigger) {
    return {
      trigger: {
        isMarket: orderType.trigger.isMarket,
        triggerPx: floatToWire(Number(orderType.trigger.triggerPx)),
        tpsl: orderType.trigger.tpsl,
      },
    };
  }
  throw new Error("Invalid order type");
}

function addressToBytes(address: string): Uint8Array {
  return getBytes(address);
}

function actionHash(
  action: unknown,
  vaultAddress: string | null,
  nonce: number
): string {
  const msgPackBytes = encode(action);
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(addressToBytes(vaultAddress), msgPackBytes.length + 9);
  }
  return keccak256(data);
}

function constructPhantomAgent(hash: string, isMainnet: boolean) {
  return { source: isMainnet ? "a" : "b", connectionId: hash };
}

export async function signL1Action(
  wallet: Wallet | HDNodeWallet,
  action: unknown,
  activePool: string | null,
  nonce: number,
  isMainnet: boolean
): Promise<Signature> {
  const hash = actionHash(action, activePool, nonce);
  const phantomAgent = constructPhantomAgent(hash, isMainnet);
  const data = {
    domain: phantomDomain,
    types: agentTypes,
    primaryType: "Agent",
    message: phantomAgent,
  };
  return signInner(wallet, data);
}

async function signInner(
  wallet: Wallet | HDNodeWallet,
  data: any
): Promise<Signature> {
  const signature = await wallet.signTypedData(
    data.domain,
    data.types,
    data.message
  );
  return splitSig(signature);
}

function splitSig(sig: string): Signature {
  const { r, s, v } = ethers.Signature.from(sig);
  return { r, s, v };
}

export function floatToWire(x: number): string {
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error(`floatToWire causes rounding: ${x}`);
  }
  let normalized = rounded.replace(/\.?0+$/, "");
  if (normalized === "-0") normalized = "0";
  return normalized;
}

export function orderToWire(order: Order, asset: number): OrderWire {
  const orderWire: OrderWire = {
    a: asset,
    b: order.is_buy,
    p: floatToWire(order.limit_px),
    s: floatToWire(order.sz),
    r: order.reduce_only,
    t: orderTypeToWire(order.order_type),
  };
  if (order.cloid !== undefined) {
    orderWire.c = order.cloid;
  }
  return orderWire;
}

export function orderWireToAction(
  orders: OrderWire[],
  grouping: Grouping = "na",
  builder?: Builder
): any {
  return {
    type: "order",
    orders: orders,
    grouping: grouping,
    ...(builder !== undefined ? { builder: builder } : {}),
  };
}