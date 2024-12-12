import axios, { Axios, AxiosInstance } from "axios";
import WebSocket from "ws";
import { orderToWire, orderWireToAction, signL1Action } from "./signing";
import { ethers, Wallet } from "ethers";
import {
  Signature,
  OrderRequest,
  WsUserFills,
  WsBook,
  WsLevel,
  WsMessage,
  Side,
} from "./types";
import "dotenv/config";

class Chase {
  private http: AxiosInstance;
  private ws: WebSocket;
  private bestPrice: number = -1;
  private aid: number = -1;
  private oid: number | null = null;
  private order: OrderRequest;
  private wallet: Wallet;
  private modifying = false;

  constructor(private coin: string, private size: number, private side: Side) {
    const privateKey = process.env.PRIVATE_KEY;
    this.wallet = new ethers.Wallet(privateKey!);

    this.http = axios.create({
      baseURL: "https://api.hyperliquid-testnet.xyz",
      headers: { "Content-Type": "application/json" },
    });

    this.ws = new WebSocket("wss://api.hyperliquid-testnet.xyz/ws");
    this.ws.onopen = () => {
      console.log("Websocket connected");

      const bookSub = {
        method: "subscribe",
        subscription: { type: "l2Book", coin: this.coin },
      };

      this.ws.send(JSON.stringify(bookSub));

      const fillsSub = {
        method: "subscribe",
        subscription: { type: "userFills", user: process.env.PUBLIC_KEY },
      };

      this.ws.send(JSON.stringify(fillsSub));
    };
    this.ws.onmessage = (event) => {
      const message: WsMessage = JSON.parse(event.data.toString());
      this.handleMessage(message);
    };
    this.ws.onclose = () => {
      console.log("WebSocket closed");
    };

    this.order = {
      coin: "BTC",
      is_buy: this.side == 0,
      sz: this.size,
      limit_px: this.bestPrice,
      order_type: { limit: { tif: "Alo" } },
      reduce_only: false,
    };
    this.initOrder();
  }

  handleMessage(message: WsMessage) {
    console.log("Message received:", message.channel);
    switch (message.channel) {
      case "l2Book":
        const book: WsBook = message.data;
        this.handleBookMessage(book);
        break;
      case "userFills":
        const fills: WsUserFills = message.data;
        this.handleFillsMessage(fills);
      default:
        break;
    }
  }

  handleBookMessage(book: WsBook) {
    if (this.modifying || this.bestPrice == -1) {
      return;
    }
    if (this.size == 0) {
      this.ws.close();
      return;
    }
    const orders: WsLevel[] = book.levels[this.side];
    const lastPrice = this.bestPrice;
    console.log(orders[0]);
    console.log(lastPrice, parseFloat(orders[0].px));

    if ((this.oid, orders[0].n == 1 && lastPrice == parseFloat(orders[0].px))) {
      this.bestPrice = parseFloat(orders[1].px);
      this.updateOrder();
      return;
    }
    this.bestPrice = parseFloat(orders[0].px);
    if (this.oid && lastPrice != this.bestPrice) {
      this.updateOrder();
      return;
    }
  }

  handleFillsMessage(fills: WsUserFills) {
    if (!fills.isSnapshot) {
      const filled = parseFloat(fills.fills[0].sz);
      this.size -= filled;
    }
    if (this.size == 0) {
      this.ws.close();
    }
  }

  getInfo() {
    return { coin: this.coin, size: this.size, side: this.side };
  }

  getOrders() {
    this.http
      .post("/info", {
        type: "openOrders",
        user: process.env.PUBLIC_KEY,
      })
      .then((res) => {
        if (res.data.length > 1) {
          return;
        } else if (res.data.length == 0) {
          this.ws.close();
          return;
        }
        this.oid = res.data[0].oid;
      });
  }

  async getBook() {
    const body = {
      type: "l2Book",
      coin: this.coin,
    };
    const res = await this.http.post("/info", body);
    const book = res.data.levels;
    this.bestPrice = parseFloat(book[this.side][1].px);
  }

  async getAssetID() {
    const res = await this.http.post("/info", { type: "meta" });
    const universe: any[] = res.data.universe;
    const id = universe.findIndex((asset) => asset.name == this.coin);
    if (id == -1) {
      throw Error("Asset does not exist");
    }
    this.aid = id;
  }

  async initOrder() {
    await this.getAssetID();
    await this.getBook();
    if (this.aid != -1 && this.bestPrice != -1) {
      this.placeOrder();
    }
  }

  buildOrder() {
    this.order.sz = this.size;
    this.order.limit_px = this.bestPrice!;
    return orderToWire(this.order, this.aid);
  }

  async placeOrder() {
    const order = this.buildOrder();
    const actions = orderWireToAction([order]);
    const nonce = Date.now();
    const signature = await signL1Action(
      this.wallet,
      actions,
      null,
      nonce,
      false
    );
    console.log("placing order");
    await this.sendOrder(actions, nonce, signature);
  }

  async updateOrder() {
    if (!this.oid) {
      return;
    }
    this.modifying = true;
    const order = this.buildOrder();
    const actions = {
      type: "modify",
      oid: this.oid,
      order,
    };
    const nonce = Date.now();
    const signature = await signL1Action(
      this.wallet,
      actions,
      null,
      nonce,
      false
    );
    console.log("modifying order");
    await this.sendOrder(actions, nonce, signature);
  }

  async sendOrder(action: any, nonce: number, signature: Signature) {
    const res = await this.http.post("/exchange", {
      action,
      nonce,
      signature,
    });

    if (!this.oid) {
      // PLACING
      console.log(res.data.response.data.statuses);
      const status = res.data.response.data.statuses[0];
      if (status.error) {
        throw new Error("Order failed");
      }
      this.oid = status.resting.oid;
    } else {
      // MODIFYING
      console.log(res.data, this.oid);
      if (res.data.status == "err") {
        this.modifying = false;
        console.log("error modifying");
        return;
      }
      this.oid = null;
      this.getOrders();
      this.modifying = false;
      console.log("done modifying");
    }
  }
}

const chase = new Chase("BTC", 0.0001, Side.SELL);
